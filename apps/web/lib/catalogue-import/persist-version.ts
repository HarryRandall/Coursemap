import type postgres from "postgres";
import {
  diffSnapshotWrites,
  isBlockingFlag,
  type SnapshotChange,
} from "./changes.ts";
import type { ClaimedImportTarget, ImportSql } from "./import-store.ts";
import { readVersionContent } from "./version-content.ts";
import type {
  CatalogueKind,
  CatalogueContent,
  RequirementWrite,
} from "../catalogue/content.ts";

export type SnapshotChangeKind = "new" | "changed" | "unchanged";

export type PersistedSnapshotCandidate = {
  changeKind: SnapshotChangeKind;
  candidateVersionId: number | null;
  baselineVersionId: number | null;
  becameDraft: boolean;
  changeSet: {
    changeKind: SnapshotChangeKind;
    contentHash: string;
    baselineVersionId: number | null;
    baselineContentHash: string | null;
    candidateVersionId: number | null;
    becameDraft: boolean;
    changes: SnapshotChange[];
    flags: CatalogueContent["flags"];
  };
};

type Tx = postgres.TransactionSql;

const COURSE_CODE_PATTERN = /^[A-Z]{4}[0-9]{4}[A-Z]?$/u;
const STRUCTURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/u;

function isValidCode(kind: CatalogueKind, code: string) {
  return kind === "course"
    ? COURSE_CODE_PATTERN.test(code)
    : STRUCTURE_CODE_PATTERN.test(code);
}

/** Every catalogue code the write refers to, so placeholder identities exist. */
function referencedItems(write: CatalogueContent) {
  const items = new Map<string, { kind: CatalogueKind; code: string }>();
  const add = (kind: CatalogueKind | null, code: string | null) => {
    if (!kind || !code) return;
    const normalised = code.trim().toUpperCase();
    if (!isValidCode(kind, normalised)) return;
    items.set(`${kind}:${normalised}`, { kind, code: normalised });
  };
  for (const condition of write.requirements.conditions) {
    add(condition.itemKind, condition.itemCode);
  }
  for (const option of write.requirements.options)
    add(option.kind, option.code);
  for (const reference of write.requirements.references) {
    add("course", reference.code);
  }
  for (const related of write.course?.relatedCourses ?? []) {
    add("course", related.sourceCourseCode);
  }
  return [...items.values()];
}

async function ensureItemIds(
  tx: Tx,
  items: Array<{ kind: CatalogueKind; code: string }>,
) {
  const ids = new Map<string, number>();
  for (const item of items) {
    await tx`
      insert into public.catalogue_codes (kind, code)
      values (${item.kind}, ${item.code})
      on conflict (kind, code) do nothing
    `;
    const [row] = await tx`
      select id from public.catalogue_codes where kind = ${item.kind} and code = ${item.code}
    `;
    ids.set(`${item.kind}:${item.code}`, Number(row.id));
  }
  return ids;
}

function itemId(
  ids: Map<string, number>,
  kind: CatalogueKind | null,
  code: string | null,
) {
  if (!kind || !code) return null;
  return ids.get(`${kind}:${code.trim().toUpperCase()}`) ?? null;
}

async function insertCourseContent(
  tx: Tx,
  snapshotId: number,
  academicYearId: number,
  sourcePageId: number | null,
  ids: Map<string, number>,
  content: NonNullable<CatalogueContent["course"]>,
) {
  const details = content.details;
  await tx`
    insert into public.course_version_details (
      version_id, title, unit_value_kind, units, minimum_units, maximum_units, eftsl,
      level, subject_code, subject_name, school, college, academic_career,
      convener_text, delivery_summary, introduction, description, workload_text,
      workload_hours, inherent_requirements, prescribed_texts, offering_status,
      source_updated_at
    ) values (
      ${snapshotId}, ${details.title}, ${details.unitValueKind}, ${details.units},
      ${details.minimumUnits}, ${details.maximumUnits}, ${details.eftsl},
      ${details.level}, ${details.subjectCode}, ${details.subjectName}, ${details.school},
      ${details.college}, ${details.academicCareer}, ${details.convenerText},
      ${details.deliverySummary}, ${details.introduction}, ${details.description},
      ${details.workloadText}, ${details.workloadHours}, ${details.inherentRequirements},
      ${details.prescribedTexts}, ${details.offeringStatus}, ${details.sourceUpdatedAt}
    )
  `;
  for (const option of content.unitOptions) {
    await tx`
      insert into public.course_unit_options (version_id, position, units, label, source_text)
      values (${snapshotId}, ${option.position}, ${option.units}, ${option.label}, ${option.sourceText})
    `;
  }
  for (const fee of content.fees) {
    await tx`
      insert into public.course_fees (
        version_id, position, fee_year, audience, fee_type, amount, currency, basis,
        student_contribution_band, source_label, source_text
      ) values (
        ${snapshotId}, ${fee.position}, ${fee.feeYear}, ${fee.audience}, ${fee.feeType},
        ${fee.amount}, ${fee.currency}, ${fee.basis}, ${fee.studentContributionBand},
        ${fee.sourceLabel}, ${fee.sourceText}
      )
    `;
  }
  for (const area of content.areasOfInterest) {
    await tx`
      insert into public.course_areas_of_interest (version_id, position, name)
      values (${snapshotId}, ${area.position}, ${area.name})
    `;
  }
  for (const attribute of content.attributes) {
    await tx`
      insert into public.course_attributes (version_id, position, attribute_kind, value, source_text)
      values (${snapshotId}, ${attribute.position}, ${attribute.attributeKind}, ${attribute.value}, ${attribute.sourceText})
    `;
  }
  for (const related of content.relatedCourses) {
    const relatedId = itemId(ids, "course", related.sourceCourseCode);
    if (relatedId === null) continue;
    await tx`
      insert into public.course_related_courses (
        version_id, position, relation_kind, related_course_id, source_course_code,
        source_course_title, source_text
      ) values (
        ${snapshotId}, ${related.position}, ${related.relationKind}, ${relatedId},
        ${related.sourceCourseCode}, ${related.sourceCourseTitle}, ${related.sourceText}
      )
    `;
  }
  const [offering] = await tx`
    insert into public.course_offerings (version_id, academic_year_id, source_page_id, delivery_mode, location)
    values (
      ${snapshotId}, ${academicYearId}, ${sourcePageId},
      ${content.offering?.deliveryMode ?? null}, ${content.offering?.location ?? null}
    )
    returning id
  `;
  for (const session of content.sessions) {
    await tx`
      insert into public.offering_sessions (
        course_offering_id, version_id, academic_year_id, source_page_id,
        academic_period_id, academic_period_code, academic_period_name, position,
        class_number, starts_on, enrol_closes_on, census_on, ends_on, delivery_mode,
        location, class_summary_url, source_text
      ) values (
        ${offering.id}, ${snapshotId}, ${academicYearId}, ${sourcePageId},
        (
          select id from public.academic_periods
          where calendar_year = ${session.calendarYear} and code = ${session.academicPeriodCode}
          limit 1
        ),
        ${session.academicPeriodCode}, ${session.academicPeriodName}, ${session.position},
        ${session.classNumber}, ${session.startsOn}, ${session.enrolClosesOn},
        ${session.censusOn}, ${session.endsOn}, ${session.deliveryMode},
        ${session.location}, ${session.classSummaryUrl}, ${session.sourceText}
      )
    `;
  }
  const outcomeIds = new Map<number, number>();
  for (const outcome of content.learningOutcomes) {
    const [row] = await tx`
      insert into public.course_learning_outcomes (version_id, position, body)
      values (${snapshotId}, ${outcome.position}, ${outcome.body})
      returning id
    `;
    outcomeIds.set(outcome.position, Number(row.id));
  }
  const assessmentIds = new Map<number, number>();
  for (const item of content.assessmentItems) {
    const [row] = await tx`
      insert into public.course_assessment_items (
        version_id, position, title, weight, hurdle, due_text, source_text
      ) values (
        ${snapshotId}, ${item.position}, ${item.title}, ${item.weight}, ${item.hurdle},
        ${item.dueText}, ${item.sourceText}
      )
      returning id
    `;
    assessmentIds.set(item.position, Number(row.id));
  }
  for (const link of content.assessmentOutcomes) {
    const assessmentId = assessmentIds.get(link.assessmentPosition);
    const outcomeId = outcomeIds.get(link.learningOutcomePosition);
    if (!assessmentId || !outcomeId) continue;
    await tx`
      insert into public.course_assessment_outcomes (version_id, assessment_item_id, learning_outcome_id)
      values (${snapshotId}, ${assessmentId}, ${outcomeId})
      on conflict do nothing
    `;
  }
}

async function insertStructureContent(
  tx: Tx,
  snapshotId: number,
  kind: CatalogueKind,
  content: NonNullable<CatalogueContent["structure"]>,
) {
  const details = content.details;
  await tx`
    insert into public.structure_version_details (
      version_id, kind, name, acronym, short_name, introduction, description, units,
      duration_years, academic_career, college, mode_of_delivery, selection_rank, atar,
      can_combine, can_combine_vertical, study_as, contact_text
    ) values (
      ${snapshotId}, ${kind}, ${details.name}, ${details.acronym}, ${details.shortName},
      ${details.introduction}, ${details.description}, ${details.units},
      ${details.durationYears}, ${details.academicCareer}, ${details.college},
      ${details.modeOfDelivery}, ${details.selectionRank}, ${details.atar},
      ${details.canCombine}, ${details.canCombineVertical}, ${details.studyAs},
      ${details.contactText}
    )
  `;
  for (const field of content.summaryFields) {
    await tx`
      insert into public.structure_snapshot_summary_fields (
        version_id, position, value_position, field_key, label, field_value, source_text
      ) values (
        ${snapshotId}, ${field.position}, ${field.valuePosition}, ${field.fieldKey},
        ${field.label}, ${field.fieldValue}, ${field.sourceText}
      )
    `;
  }
  for (const section of content.sections) {
    await tx`
      insert into public.academic_structure_snapshot_sections (
        version_id, section_key, heading, markdown, source_text, source_locator, position
      ) values (
        ${snapshotId}, ${section.sectionKey}, ${section.heading}, ${section.markdown},
        ${section.sourceText}, ${section.sourceLocator}, ${section.position}
      )
    `;
  }
  for (const outcome of content.learningOutcomes) {
    await tx`
      insert into public.academic_structure_learning_outcomes (
        version_id, position, outcome_text, source_text, source_locator
      ) values (
        ${snapshotId}, ${outcome.position}, ${outcome.outcomeText}, ${outcome.sourceText},
        ${outcome.sourceLocator}
      )
    `;
  }
  for (const fee of content.fees) {
    await tx`
      insert into public.academic_structure_fees (
        version_id, position, fee_year, audience, fee_type, amount, currency, basis,
        source_label, source_text, source_locator
      ) values (
        ${snapshotId}, ${fee.position}, ${fee.feeYear}, ${fee.audience}, ${fee.feeType},
        ${fee.amount}, ${fee.currency}, ${fee.basis}, ${fee.sourceLabel}, ${fee.sourceText},
        ${fee.sourceLocator}
      )
    `;
  }
  for (const relationship of content.relationships) {
    await tx`
      insert into public.academic_structure_snapshot_relationships (
        version_id, position, relationship_kind, target_kind, target_code, target_title,
        source_text, source_locator
      ) values (
        ${snapshotId}, ${relationship.position}, ${relationship.relationshipKind},
        ${relationship.targetKind}, ${relationship.targetCode}, ${relationship.targetTitle},
        ${relationship.sourceText}, ${relationship.sourceLocator}
      )
    `;
  }
}

async function insertRequirements(
  tx: Tx,
  snapshotId: number,
  academicYearId: number,
  sourcePageId: number | null,
  ids: Map<string, number>,
  requirements: RequirementWrite,
) {
  const ruleIds = new Map<string, number>();
  for (const rule of requirements.rules) {
    const [row] = await tx`
      insert into public.requirement_rules (
        version_id, academic_year_id, source_page_id, rule_kind, hardness, source_text,
        source_locator, review_state, confidence, position
      ) values (
        ${snapshotId}, ${academicYearId}, ${sourcePageId}, ${rule.key}, ${rule.hardness},
        ${rule.sourceText}, ${rule.sourceLocator}, ${rule.reviewState}, ${rule.confidence},
        ${rule.position}
      )
      returning id
    `;
    ruleIds.set(rule.key, Number(row.id));
  }

  // Parents before children: repeatedly insert groups whose parent is known.
  const groupIds = new Map<string, number>();
  let pending = [...requirements.groups];
  while (pending.length > 0) {
    const ready = pending.filter(
      (group) => group.parentKey === null || groupIds.has(group.parentKey),
    );
    if (ready.length === 0) {
      throw new TypeError("Requirement groups reference an unknown parent.");
    }
    for (const group of ready) {
      const ruleId = ruleIds.get(group.ruleKey);
      if (ruleId === undefined) {
        throw new TypeError(`Requirement group ${group.key} has no rule.`);
      }
      const [row] = await tx`
        insert into public.requirement_groups (
          rule_id, version_id, parent_group_id, group_key, label, description, operator,
          minimum_count, minimum_units, maximum_units, source_text, source_locator, position
        ) values (
          ${ruleId}, ${snapshotId},
          ${group.parentKey === null ? null : groupIds.get(group.parentKey)!},
          ${group.key}, ${group.label}, ${group.description}, ${group.operator},
          ${group.minimumCount}, ${group.minimumUnits}, ${group.maximumUnits},
          ${group.sourceText}, ${group.sourceLocator}, ${group.position}
        )
        returning id
      `;
      groupIds.set(group.key, Number(row.id));
    }
    pending = pending.filter((group) => !groupIds.has(group.key));
  }

  const conditionIds = new Map<string, number>();
  for (const condition of requirements.conditions) {
    const ruleId = ruleIds.get(condition.ruleKey);
    const groupId = groupIds.get(condition.groupKey);
    if (ruleId === undefined || groupId === undefined) {
      throw new TypeError(
        `Requirement condition ${condition.key} has no group.`,
      );
    }
    // item_kind travels with code_id so the composite foreign key can hold the
    // referenced item to the kind the condition expects.
    const conditionItemId = itemId(ids, condition.itemKind, condition.itemCode);
    const [row] = await tx`
      insert into public.requirement_conditions (
        rule_id, version_id, group_id, condition_key, position, condition_kind, code_id,
        item_kind, structure_kind, requirement_mode, minimum_mark, minimum_units, maximum_units,
        minimum_count, subject_code, minimum_level, maximum_level, minimum_year,
        minimum_gpa, minimum_wam, tag, free_text, hardness, source_text, source_locator,
        review_state, confidence
      ) values (
        ${ruleId}, ${snapshotId}, ${groupId}, ${condition.key}, ${condition.position},
        ${condition.kind}, ${conditionItemId},
        ${conditionItemId === null ? null : condition.itemKind},
        ${condition.structureKind}, ${condition.requirementMode}, ${condition.minimumMark},
        ${condition.minimumUnits}, ${condition.maximumUnits}, ${condition.minimumCount},
        ${condition.subjectCode}, ${condition.minimumLevel}, ${condition.maximumLevel},
        ${condition.minimumYear}, ${condition.minimumGpa}, ${condition.minimumWam},
        ${condition.tag}, ${condition.freeText}, ${condition.hardness},
        ${condition.sourceText}, ${condition.sourceLocator}, ${condition.reviewState},
        ${condition.confidence}
      )
      returning id
    `;
    conditionIds.set(condition.key, Number(row.id));
  }

  for (const option of requirements.options) {
    const conditionId = conditionIds.get(option.conditionKey);
    if (conditionId === undefined) continue;
    const code = option.code.trim().toUpperCase();
    if (!isValidCode(option.kind, code)) continue;
    await tx`
      insert into public.requirement_condition_options (
        condition_id, version_id, position, kind, code, code_id, title, source_text
      ) values (
        ${conditionId}, ${snapshotId}, ${option.position}, ${option.kind}, ${code},
        ${itemId(ids, option.kind, code)}, ${option.title}, ${option.sourceText}
      )
      on conflict (condition_id, code) do nothing
    `;
  }

  for (const reference of requirements.references) {
    const ruleId = ruleIds.get(reference.ruleKey);
    const referencedId = itemId(ids, "course", reference.code);
    if (ruleId === undefined || referencedId === null) continue;
    await tx`
      insert into public.requirement_item_references (
        rule_id, version_id, code_id, source_text, confidence, review_state
      ) values (
        ${ruleId}, ${snapshotId}, ${referencedId}, ${reference.sourceText},
        ${reference.confidence}, ${reference.reviewState}
      )
      on conflict (rule_id, code_id) do nothing
    `;
  }
}

/** Writes every content, requirement and evidence row for a new snapshot. */
export async function insertVersionContent(
  tx: Tx,
  {
    snapshotId,
    kind,
    academicYearId,
    sourcePageId,
    write,
  }: {
    snapshotId: number;
    kind: CatalogueKind;
    academicYearId: number;
    sourcePageId: number | null;
    write: CatalogueContent;
  },
) {
  const ids = await ensureItemIds(tx, referencedItems(write));
  if (write.course) {
    await insertCourseContent(
      tx,
      snapshotId,
      academicYearId,
      sourcePageId,
      ids,
      write.course,
    );
  }
  if (write.structure) {
    await insertStructureContent(tx, snapshotId, kind, write.structure);
  }
  await insertRequirements(
    tx,
    snapshotId,
    academicYearId,
    sourcePageId,
    ids,
    write.requirements,
  );
  for (const evidence of write.evidence) {
    await tx`
      insert into public.catalogue_version_provenance (
        version_id, academic_year_id, source_page_id, field_path, method, confidence,
        source_locator, source_excerpt
      ) values (
        ${snapshotId}, ${academicYearId}, ${sourcePageId}, ${evidence.fieldPath},
        ${evidence.method}, ${evidence.confidence}, ${evidence.sourceLocator},
        ${evidence.sourceExcerpt}
      )
    `;
  }
}

/** Records the review entries for a target: one row per change and per flag. */
export async function insertImportChanges(
  tx: Tx,
  {
    targetId,
    changes,
    flags,
    acceptAll,
  }: {
    targetId: string;
    changes: SnapshotChange[];
    flags: CatalogueContent["flags"];
    acceptAll: boolean;
  },
) {
  await tx`delete from public.catalogue_import_changes where target_id = ${targetId}::uuid`;
  let position = 0;
  for (const change of changes) {
    await tx`
      insert into public.catalogue_import_changes (
        target_id, entry_kind, field_path, old_value, new_value, summary, source_locator,
        source_excerpt, status, resolved_at, position
      ) values (
        ${targetId}::uuid, 'change', ${change.fieldPath},
        ${tx.json(change.oldValue as never)}, ${tx.json(change.newValue as never)},
        ${change.summary}, ${change.sourceLocator}, ${change.sourceExcerpt},
        ${acceptAll ? "accepted" : "open"}, ${acceptAll ? tx`now()` : null}, ${position}
      )
    `;
    position += 1;
  }
  for (const flag of flags) {
    await tx`
      insert into public.catalogue_import_changes (
        target_id, entry_kind, field_path, severity, is_blocking, issue_code, summary,
        source_excerpt, position
      ) values (
        ${targetId}::uuid, 'flag', ${flag.fieldPath ?? "snapshot"}, ${flag.severity},
        ${isBlockingFlag(flag)}, ${flag.code}, ${flag.message}, ${flag.sourceExcerpt}, ${position}
      )
    `;
    position += 1;
  }
}

/**
 * Assembles a candidate version for an import target. Returns `unchanged`
 * without writing when the content hash matches the baseline. A first import
 * for a record becomes its applied version immediately with every change accepted;
 * otherwise the changes stay open for review.
 */
export async function persistVersionCandidate(
  sql: ImportSql,
  {
    claim,
    sourcePageId,
    write,
  }: {
    claim: ClaimedImportTarget;
    sourcePageId: number | null;
    write: CatalogueContent;
  },
): Promise<PersistedSnapshotCandidate> {
  if (
    write.kind !== claim.kind ||
    write.code !== claim.code ||
    write.academicYear !== claim.academicYear
  ) {
    throw new TypeError(
      "The snapshot content does not match its import target.",
    );
  }

  return sql.begin(async (tx) => {
    const [itemYear] = await tx`
      select id
      from public.catalogue_records
      where id = ${claim.recordId}
      for update
    `;
    if (!itemYear) throw new Error("The catalogue item year was not resolved.");
    const baselineVersionId = claim.baselineVersionId;
    const [baseline] = baselineVersionId
      ? await tx`select content_hash from public.catalogue_versions where id = ${baselineVersionId}`
      : [];
    const baselineContentHash = baseline ? String(baseline.content_hash) : null;

    if (baselineContentHash === write.contentHash) {
      await insertImportChanges(tx, {
        targetId: claim.targetId,
        changes: [],
        flags: write.flags,
        acceptAll: true,
      });
      return {
        changeKind: "unchanged" as const,
        candidateVersionId: null,
        baselineVersionId,
        becameDraft: false,
        changeSet: {
          changeKind: "unchanged" as const,
          contentHash: write.contentHash,
          baselineVersionId,
          baselineContentHash,
          candidateVersionId: null,
          becameDraft: false,
          changes: [],
          flags: write.flags,
        },
      };
    }

    const baselineWrite = baselineVersionId
      ? await readVersionContent(tx, baselineVersionId)
      : null;
    const changes = diffSnapshotWrites(baselineWrite, write);
    if (claim.directoryEntryId !== null) {
      await tx`
        update public.catalogue_listings
        set code_id = ${claim.itemId}
        where id = ${claim.directoryEntryId} and code_id is null
      `;
    }

    const [snapshot] = await tx`
      insert into public.catalogue_versions (
        record_id, kind, academic_year_id, origin, based_on_version_id, source_page_id,
        content_hash, import_target_id
      ) values (
        ${claim.recordId}, ${claim.kind}, ${claim.academicYearId}, 'import',
        ${baselineVersionId}, ${sourcePageId}, ${write.contentHash}, ${claim.targetId}::uuid
      )
      returning id
    `;
    const snapshotId = Number(snapshot.id);
    await insertVersionContent(tx, {
      snapshotId,
      kind: claim.kind,
      academicYearId: claim.academicYearId,
      sourcePageId,
      write,
    });
    await tx`
      update public.catalogue_versions
      set sealed_at = greatest(statement_timestamp(), created_at)
      where id = ${snapshotId}
    `;

    const becameDraft = baselineVersionId === null;
    await insertImportChanges(tx, {
      targetId: claim.targetId,
      changes,
      flags: write.flags,
      acceptAll: becameDraft,
    });
    if (becameDraft) {
      // A first import has nothing to compare against, so its changes are
      // recorded as already accepted and the candidate becomes the applied version
      // without anyone pressing Apply. Recording that here keeps the target
      // honest: it was applied, and leaving applied_version_id null made a
      // published record still read "Ready for review".
      await tx`
        update public.catalogue_import_targets
        set applied_version_id = ${snapshotId}, applied_at = now()
        where id = ${claim.targetId}::uuid
      `;
    }
    const changeKind: SnapshotChangeKind = becameDraft ? "new" : "changed";
    return {
      changeKind,
      candidateVersionId: snapshotId,
      baselineVersionId,
      becameDraft,
      changeSet: {
        changeKind,
        contentHash: write.contentHash,
        baselineVersionId,
        baselineContentHash,
        candidateVersionId: snapshotId,
        becameDraft,
        changes,
        flags: write.flags,
      },
    };
  });
}
