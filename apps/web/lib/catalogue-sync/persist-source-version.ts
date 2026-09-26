import type postgres from "postgres";
import type { ClaimedCatalogueSync, SyncSql } from "./sync-store.ts";
import type {
  CatalogueKind,
  CatalogueContent,
  RequirementWrite,
} from "../catalogue/content.ts";
import {
  CATALOGUE_CONTENT_SCHEMA_VERSION,
  emptyCatalogueContent,
  validateCatalogueContent,
} from "../catalogue/content.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../catalogue-import/version-content.ts";
import {
  generateFirstReadReview,
  generateSourceReview,
} from "../catalogue/source-review-store.ts";

export type PersistedSourceVersion = {
  status: "unchanged" | "review_required" | "applied";
  sourceVersionId: number;
  populatedDraft: boolean;
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
  for (const tag of content.tags ?? []) {
    await tx`
      insert into public.course_tags (version_id, position, name)
      values (${snapshotId}, ${tag.position}, ${tag.name})
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

/**
 * Writes every content, requirement, evidence and review-flag row for a new
 * snapshot.
 */
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
  for (const [index, flag] of write.flags.entries()) {
    await tx`
      insert into public.catalogue_version_flags (
        version_id, position, field_path, severity, code, message
      ) values (
        ${snapshotId}, ${index + 1}, ${flag.fieldPath}, ${flag.severity},
        ${flag.code}, ${flag.message}
      )
    `;
  }
}

/** Persists one semantic ANU observation without changing local content. */
export async function persistSourceVersion(
  sql: SyncSql,
  {
    claim,
    sourceDocumentId,
    write,
  }: {
    claim: ClaimedCatalogueSync;
    sourceDocumentId: number;
    write: CatalogueContent;
  },
): Promise<PersistedSourceVersion> {
  if (
    write.kind !== claim.kind ||
    write.code !== claim.code ||
    write.academicYear !== claim.academicYear
  ) {
    throw new TypeError(
      "The source content does not match its catalogue sync.",
    );
  }

  return sql.begin(async (tx) => {
    const [record] = await tx`
      select records.id, records.published_version_id, records.latest_source_version_id,
        codes.code, years.year, listings.title as listing_title
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      join public.academic_years as years on years.id = records.academic_year_id
      left join public.catalogue_listings as listings on listings.code_id = records.code_id
        and listings.academic_year_id = records.academic_year_id
        and listings.kind = records.kind
      where records.id = ${claim.recordId}
      for update of records
    `;
    if (!record) throw new Error("The catalogue record was not resolved.");
    const [existing] = await tx`
      select versions.id
      from public.catalogue_versions as versions
      where versions.sync_id = ${claim.syncId}::uuid
      limit 1
    `;
    if (existing) {
      const sourceVersionId = Number(existing.id);
      const [draftFromSource] = await tx`
        select 1 from public.catalogue_drafts
        where record_id = ${claim.recordId} and base_version_id = ${sourceVersionId}
      `;
      return {
        status: draftFromSource ? "applied" : "review_required",
        sourceVersionId,
        populatedDraft: Boolean(draftFromSource),
      };
    }
    const lockDraft = async () => {
      const [row] =
        await tx`select content, content_hash from public.catalogue_drafts
        where record_id = ${claim.recordId} for update`;
      return row;
    };
    const hasMeaningfulLocalContent = (
      draft: Record<string, unknown> | undefined,
    ) => {
      const empty = emptyCatalogueContent({
        kind: claim.kind,
        code: claim.code,
        academicYear: claim.academicYear,
        title:
          record.listing_title === null ? null : String(record.listing_title),
      });
      return (
        record.published_version_id !== null ||
        (draft !== undefined &&
          String(draft.content_hash) !== contentHashForCatalogueContent(empty))
      );
    };
    /**
     * Fills the draft from a source version and queues every part of it for
     * a person. Review rows belong to the sync that made the version, so
     * they stay joined to it when this sync found nothing new.
     */
    const populateDraft = async (
      sourceVersionId: number,
      reviewSyncId: string,
    ) => {
      await tx`insert into public.catalogue_drafts (
        record_id, base_version_id, content, content_hash, content_schema_version,
        revision, updated_by
      ) values (${claim.recordId}, ${sourceVersionId}, ${tx.json(write as never)},
        ${write.contentHash}, ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 0, null)
      on conflict (record_id) do update set base_version_id = excluded.base_version_id,
        content = excluded.content, content_hash = excluded.content_hash,
        content_schema_version = excluded.content_schema_version,
        revision = public.catalogue_drafts.revision + 1, updated_by = null,
        updated_at = now()`;
      await tx`delete from public.catalogue_draft_provenance where record_id = ${claim.recordId}`;
      await tx`insert into public.catalogue_draft_provenance (
        record_id, field_path, origin, source_version_id, source_evidence_id
      ) select ${claim.recordId}, field_path, method, ${sourceVersionId}, id
        from public.catalogue_version_provenance where version_id = ${sourceVersionId}`;
      await tx`insert into public.catalogue_change_events (
        record_id, draft_revision, event_kind, origin, version_id
      ) select ${claim.recordId}, revision, 'source_draft_created', 'source', ${sourceVersionId}
        from public.catalogue_drafts where record_id = ${claim.recordId}`;
      // The draft took the model's reading whole, so every part of it is
      // queued for a person, rated by how sure the reading is.
      await generateFirstReadReview(tx, {
        syncId: reviewSyncId,
        recordId: claim.recordId,
        content: write,
      });
    };
    const previousSourceVersionId =
      record.latest_source_version_id === null
        ? null
        : Number(record.latest_source_version_id);
    const [previous] = previousSourceVersionId
      ? await tx`select content_hash, sync_id from public.catalogue_versions where id = ${previousSourceVersionId}`
      : [];
    if (previous && String(previous.content_hash) === write.contentHash) {
      await tx`update public.catalogue_records set source_checked_at = now()
        where id = ${claim.recordId}`;
      // ANU has not changed, but a record whose draft was discarded still
      // wants the reading back.
      const draft = await lockDraft();
      if (!hasMeaningfulLocalContent(draft) && previous.sync_id !== null) {
        await populateDraft(previousSourceVersionId!, String(previous.sync_id));
        return {
          status: "applied",
          sourceVersionId: previousSourceVersionId!,
          populatedDraft: true,
        };
      }
      await tx`insert into public.catalogue_change_events (
        record_id, event_kind, origin, actor_id, version_id
      ) values (${claim.recordId}, 'source_checked', 'source', null, ${previousSourceVersionId})`;
      return {
        status: "unchanged",
        sourceVersionId: previousSourceVersionId!,
        populatedDraft: false,
      };
    }

    const [version] = await tx`
      insert into public.catalogue_versions (
        record_id, kind, academic_year_id, origin, based_on_version_id,
        source_document_id, content_hash, sync_id
      ) values (
        ${claim.recordId}, ${claim.kind}, ${claim.academicYearId}, 'source',
        ${previousSourceVersionId}, ${sourceDocumentId}, ${write.contentHash}, ${claim.syncId}::uuid
      )
      returning id
    `;
    const sourceVersionId = Number(version.id);
    await insertVersionContent(tx, {
      snapshotId: sourceVersionId,
      kind: claim.kind,
      academicYearId: claim.academicYearId,
      sourcePageId: null,
      write,
    });
    await tx`update public.catalogue_version_provenance
      set source_document_id = ${sourceDocumentId}
      where version_id = ${sourceVersionId}`;
    await tx`
      update public.catalogue_versions
      set sealed_at = greatest(statement_timestamp(), created_at)
      where id = ${sourceVersionId}
    `;
    await tx`update public.catalogue_records set
      latest_source_version_id = ${sourceVersionId}, source_checked_at = now()
      where id = ${claim.recordId}`;

    const draft = await lockDraft();
    // A record with nothing of its own, never read or discarded since, takes
    // the reading whole rather than comparing it with nothing.
    if (!hasMeaningfulLocalContent(draft)) {
      await populateDraft(sourceVersionId, claim.syncId);
      return { status: "applied", sourceVersionId, populatedDraft: true };
    }

    await tx`insert into public.catalogue_change_events (
      record_id, event_kind, origin, version_id
    ) values (${claim.recordId}, 'source_changed', 'source', ${sourceVersionId})`;

    // The local side of the comparison is whatever an administrator would see
    // if they opened the record now: the draft, or the publication a draft
    // would be created from.
    const baseSource = previousSourceVersionId
      ? await readVersionContent(tx, previousSourceVersionId)
      : null;
    const local = draft
      ? validateCatalogueContent(draft.content)
      : record.published_version_id !== null
        ? await readVersionContent(tx, Number(record.published_version_id))
        : null;
    await generateSourceReview(tx, {
      syncId: claim.syncId,
      recordId: claim.recordId,
      baseSource,
      local,
      incomingSource: write,
    });
    return {
      status: "review_required",
      sourceVersionId,
      populatedDraft: false,
    };
  });
}
