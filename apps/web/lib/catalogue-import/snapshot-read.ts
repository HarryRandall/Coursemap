import type postgres from "postgres";
import { stableFingerprint } from "./canonical.ts";
import type { ImportSql, ImportTransactionSql } from "./import-store.ts";
import type {
  CatalogueKind,
  CatalogueSnapshotWrite,
  RequirementConditionKind,
  RequirementRuleKind,
  RequirementWrite,
  ReviewState,
} from "./snapshot-write.ts";

type Sql = ImportSql | ImportTransactionSql | postgres.Sql;

function num(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function str(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function date(value: unknown) {
  if (value === null || value === undefined) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
}

async function readRequirements(
  sql: Sql,
  snapshotId: number,
): Promise<RequirementWrite> {
  const rules = await sql`
    select id, rule_kind, hardness, source_text, source_locator, review_state, confidence, position
    from public.requirement_rules where snapshot_id = ${snapshotId} order by position, rule_kind
  `;
  const ruleKeyById = new Map(
    rules.map((rule) => [
      Number(rule.id),
      rule.rule_kind as RequirementRuleKind,
    ]),
  );
  const groups = await sql`
    select id, rule_id, parent_group_id, group_key, label, description, operator, minimum_count,
      minimum_units, maximum_units, source_text, source_locator, position
    from public.requirement_groups where snapshot_id = ${snapshotId} order by rule_id, position, id
  `;
  const groupKeyById = new Map(
    groups.map((group) => [Number(group.id), String(group.group_key)]),
  );
  const conditions = await sql`
    select conditions.*, items.code as item_code, items.kind as item_kind
    from public.requirement_conditions as conditions
    left join public.catalogue_items as items on items.id = conditions.item_id
    where conditions.snapshot_id = ${snapshotId}
    order by conditions.rule_id, conditions.position, conditions.id
  `;
  const conditionKeyById = new Map(
    conditions.map((condition) => [
      Number(condition.id),
      String(condition.condition_key),
    ]),
  );
  const options = await sql`
    select condition_id, position, kind, code, title, source_text
    from public.requirement_condition_options where snapshot_id = ${snapshotId}
    order by condition_id, position
  `;
  const references = await sql`
    select item_references.rule_id, items.code, item_references.source_text,
      item_references.confidence, item_references.review_state
    from public.requirement_item_references as item_references
    join public.catalogue_items as items on items.id = item_references.item_id
    where item_references.snapshot_id = ${snapshotId}
    order by item_references.rule_id, items.code
  `;
  return {
    rules: rules.map((rule) => ({
      key: rule.rule_kind as RequirementRuleKind,
      hardness: rule.hardness as "hard" | "advisory",
      sourceText: String(rule.source_text),
      sourceLocator: str(rule.source_locator),
      reviewState: rule.review_state as ReviewState,
      confidence: Number(rule.confidence),
      position: Number(rule.position),
    })),
    groups: groups.map((group) => ({
      key: String(group.group_key),
      ruleKey: ruleKeyById.get(Number(group.rule_id))!,
      parentKey:
        group.parent_group_id === null
          ? null
          : (groupKeyById.get(Number(group.parent_group_id)) ?? null),
      label: str(group.label),
      description: str(group.description),
      operator: group.operator as "all_of" | "any_of" | "at_least",
      minimumCount: num(group.minimum_count),
      minimumUnits: num(group.minimum_units),
      maximumUnits: num(group.maximum_units),
      sourceText: str(group.source_text),
      sourceLocator: str(group.source_locator),
      position: Number(group.position),
    })),
    conditions: conditions.map((condition) => ({
      key: String(condition.condition_key),
      ruleKey: ruleKeyById.get(Number(condition.rule_id))!,
      groupKey: groupKeyById.get(Number(condition.group_id))!,
      position: Number(condition.position),
      kind: condition.condition_kind as RequirementConditionKind,
      itemCode: str(condition.item_code),
      itemKind: (condition.item_kind as CatalogueKind | null) ?? null,
      structureKind:
        condition.structure_kind as RequirementWrite["conditions"][number]["structureKind"],
      requirementMode: condition.requirement_mode as
        "completed" | "completed_or_concurrent" | null,
      minimumMark: num(condition.minimum_mark),
      minimumUnits: num(condition.minimum_units),
      maximumUnits: num(condition.maximum_units),
      minimumCount: num(condition.minimum_count),
      subjectCode: str(condition.subject_code),
      minimumLevel: num(condition.minimum_level),
      maximumLevel: num(condition.maximum_level),
      minimumYear: num(condition.minimum_year),
      minimumGpa: num(condition.minimum_gpa),
      minimumWam: num(condition.minimum_wam),
      tag: str(condition.tag),
      freeText: str(condition.free_text),
      hardness: condition.hardness as "hard" | "advisory",
      sourceText: str(condition.source_text),
      sourceLocator: str(condition.source_locator),
      reviewState: condition.review_state as ReviewState,
      confidence: Number(condition.confidence),
    })),
    options: options.map((option) => ({
      conditionKey: conditionKeyById.get(Number(option.condition_id))!,
      position: Number(option.position),
      kind: option.kind as CatalogueKind,
      code: String(option.code),
      title: str(option.title),
      sourceText: str(option.source_text),
    })),
    references: references.map((reference) => ({
      ruleKey: ruleKeyById.get(Number(reference.rule_id))!,
      code: String(reference.code),
      sourceText: String(reference.source_text),
      confidence: Number(reference.confidence),
      reviewState: reference.review_state as ReviewState,
    })),
  };
}

async function readCourseContent(
  sql: Sql,
  snapshotId: number,
): Promise<CatalogueSnapshotWrite["course"]> {
  const [details] = await sql`
    select * from public.course_snapshot_details where snapshot_id = ${snapshotId}
  `;
  if (!details) return null;
  const [
    unitOptions,
    fees,
    areas,
    attributes,
    related,
    offerings,
    sessions,
    outcomes,
    assessments,
    links,
  ] = await Promise.all([
    sql`select position, units, label, source_text from public.course_unit_options where snapshot_id = ${snapshotId} order by position`,
    sql`select * from public.course_fees where snapshot_id = ${snapshotId} order by position`,
    sql`select position, name from public.course_areas_of_interest where snapshot_id = ${snapshotId} order by position`,
    sql`select position, attribute_kind, value, source_text from public.course_attributes where snapshot_id = ${snapshotId} order by position`,
    sql`select position, relation_kind, source_course_code, source_course_title, source_text from public.course_related_courses where snapshot_id = ${snapshotId} order by position`,
    sql`select delivery_mode, location from public.course_offerings where snapshot_id = ${snapshotId} limit 1`,
    sql`select sessions.*, academic_years.year as calendar_year from public.offering_sessions as sessions join public.academic_years on academic_years.id = sessions.academic_year_id where sessions.snapshot_id = ${snapshotId} order by sessions.position`,
    sql`select id, position, body from public.course_learning_outcomes where snapshot_id = ${snapshotId} order by position`,
    sql`select id, position, title, weight, hurdle, due_text, source_text from public.course_assessment_items where snapshot_id = ${snapshotId} order by position`,
    sql`select assessment_item_id, learning_outcome_id from public.course_assessment_outcomes where snapshot_id = ${snapshotId}`,
  ]);
  const outcomePosition = new Map(
    outcomes.map((row) => [Number(row.id), Number(row.position)]),
  );
  const assessmentPosition = new Map(
    assessments.map((row) => [Number(row.id), Number(row.position)]),
  );
  return {
    details: {
      title: String(details.title),
      unitValueKind: details.unit_value_kind,
      units: num(details.units),
      minimumUnits: num(details.minimum_units),
      maximumUnits: num(details.maximum_units),
      eftsl: num(details.eftsl),
      level: Number(details.level),
      subjectCode: String(details.subject_code),
      subjectName: str(details.subject_name),
      school: str(details.school),
      college: str(details.college),
      academicCareer: details.academic_career,
      convenerText: str(details.convener_text),
      deliverySummary: str(details.delivery_summary),
      introduction: str(details.introduction),
      description: str(details.description),
      workloadText: str(details.workload_text),
      workloadHours: num(details.workload_hours),
      inherentRequirements: str(details.inherent_requirements),
      prescribedTexts: str(details.prescribed_texts),
      offeringStatus: details.offering_status,
      sourceUpdatedAt:
        details.source_updated_at === null
          ? null
          : new Date(details.source_updated_at).toISOString(),
    },
    unitOptions: unitOptions.map((row) => ({
      position: Number(row.position),
      units: Number(row.units),
      label: str(row.label),
      sourceText: String(row.source_text),
    })),
    fees: fees.map((row) => ({
      position: Number(row.position),
      feeYear: num(row.fee_year),
      audience: row.audience,
      feeType: row.fee_type,
      amount: num(row.amount),
      currency: str(row.currency),
      basis: row.basis,
      studentContributionBand: num(row.student_contribution_band),
      sourceLabel: str(row.source_label),
      sourceText: String(row.source_text ?? ""),
    })),
    areasOfInterest: areas.map((row) => ({
      position: Number(row.position),
      name: String(row.name),
    })),
    attributes: attributes.map((row) => ({
      position: Number(row.position),
      attributeKind: row.attribute_kind,
      value: String(row.value),
      sourceText: String(row.source_text),
    })),
    relatedCourses: related.map((row) => ({
      position: Number(row.position),
      relationKind: row.relation_kind,
      sourceCourseCode: String(row.source_course_code),
      sourceCourseTitle: str(row.source_course_title),
      sourceText: String(row.source_text ?? ""),
    })),
    offering: offerings[0]
      ? {
          deliveryMode: str(offerings[0].delivery_mode),
          location: str(offerings[0].location),
        }
      : null,
    sessions: sessions.map((row) => ({
      position: Number(row.position),
      calendarYear: Number(row.calendar_year),
      academicPeriodCode: String(row.academic_period_code),
      academicPeriodName: String(row.academic_period_name),
      classNumber: str(row.class_number),
      startsOn: date(row.starts_on),
      enrolClosesOn: date(row.enrol_closes_on),
      censusOn: date(row.census_on),
      endsOn: date(row.ends_on),
      deliveryMode: str(row.delivery_mode),
      location: str(row.location),
      classSummaryUrl: str(row.class_summary_url),
      sourceText: String(row.source_text),
    })),
    learningOutcomes: outcomes.map((row) => ({
      position: Number(row.position),
      body: String(row.body),
    })),
    assessmentItems: assessments.map((row) => ({
      position: Number(row.position),
      title: String(row.title),
      weight: num(row.weight),
      hurdle: row.hurdle === null ? null : Boolean(row.hurdle),
      dueText: str(row.due_text),
      sourceText: String(row.source_text),
    })),
    assessmentOutcomes: links
      .map((row) => ({
        assessmentPosition:
          assessmentPosition.get(Number(row.assessment_item_id)) ?? 0,
        learningOutcomePosition:
          outcomePosition.get(Number(row.learning_outcome_id)) ?? 0,
      }))
      .filter((row) => row.assessmentPosition && row.learningOutcomePosition)
      .sort(
        (left, right) =>
          left.assessmentPosition - right.assessmentPosition ||
          left.learningOutcomePosition - right.learningOutcomePosition,
      ),
  };
}

async function readStructureContent(
  sql: Sql,
  snapshotId: number,
): Promise<CatalogueSnapshotWrite["structure"]> {
  const [details] = await sql`
    select * from public.structure_snapshot_details where snapshot_id = ${snapshotId}
  `;
  if (!details) return null;
  const [sections, outcomes, fees, relationships] = await Promise.all([
    sql`select section_key, heading, markdown, source_text, source_locator, position from public.academic_structure_snapshot_sections where snapshot_id = ${snapshotId} order by position`,
    sql`select position, outcome_text, source_text, source_locator from public.academic_structure_learning_outcomes where snapshot_id = ${snapshotId} order by position`,
    sql`select * from public.academic_structure_fees where snapshot_id = ${snapshotId} order by position`,
    sql`select * from public.academic_structure_snapshot_relationships where snapshot_id = ${snapshotId} order by position`,
  ]);
  return {
    details: {
      name: String(details.name),
      acronym: str(details.acronym),
      shortName: str(details.short_name),
      introduction: str(details.introduction),
      description: str(details.description),
      units: num(details.units),
      durationYears: num(details.duration_years),
      academicCareer: str(details.academic_career),
      college: str(details.college),
      modeOfDelivery: str(details.mode_of_delivery),
      selectionRank: num(details.selection_rank),
      atar: num(details.atar),
      canCombine:
        details.can_combine === null ? null : Boolean(details.can_combine),
      canCombineVertical:
        details.can_combine_vertical === null
          ? null
          : Boolean(details.can_combine_vertical),
      studyAs: str(details.study_as),
      contactText: str(details.contact_text),
    },
    sections: sections.map((row) => ({
      position: Number(row.position),
      sectionKey: String(row.section_key),
      heading: String(row.heading),
      markdown: String(row.markdown),
      sourceText: String(row.source_text),
      sourceLocator: String(row.source_locator),
    })),
    learningOutcomes: outcomes.map((row) => ({
      position: Number(row.position),
      outcomeText: String(row.outcome_text),
      sourceText: String(row.source_text),
      sourceLocator: String(row.source_locator),
    })),
    fees: fees.map((row) => ({
      position: Number(row.position),
      feeYear: num(row.fee_year),
      audience: row.audience,
      feeType: row.fee_type,
      amount: num(row.amount),
      currency: str(row.currency),
      basis: row.basis,
      sourceLabel: str(row.source_label),
      sourceText: String(row.source_text),
      sourceLocator: String(row.source_locator),
    })) as NonNullable<CatalogueSnapshotWrite["structure"]>["fees"],
    relationships: relationships.map((row) => ({
      position: Number(row.position),
      relationshipKind: row.relationship_kind,
      targetKind: row.target_kind,
      targetCode: String(row.target_code),
      targetTitle: str(row.target_title),
      sourceText: String(row.source_text),
      sourceLocator: String(row.source_locator),
    })) as NonNullable<CatalogueSnapshotWrite["structure"]>["relationships"],
  };
}

/**
 * Reads a stored snapshot back into the write shape so it can be diffed
 * against a candidate or edited and saved as a new snapshot. Evidence is not
 * carried across; a derived snapshot records its own.
 */
export async function readSnapshotWrite(
  sql: Sql,
  snapshotId: number,
): Promise<CatalogueSnapshotWrite | null> {
  const [snapshot] = await sql`
    select snapshots.kind, snapshots.content_hash, items.code, academic_years.year
    from public.catalogue_snapshots as snapshots
    join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
    join public.catalogue_items as items on items.id = item_years.item_id
    join public.academic_years on academic_years.id = snapshots.academic_year_id
    where snapshots.id = ${snapshotId}
  `;
  if (!snapshot) return null;
  const kind = snapshot.kind as CatalogueKind;
  const [course, structure, requirements] = await Promise.all([
    kind === "course"
      ? readCourseContent(sql, snapshotId)
      : Promise.resolve(null),
    kind === "course"
      ? Promise.resolve(null)
      : readStructureContent(sql, snapshotId),
    readRequirements(sql, snapshotId),
  ]);
  return {
    kind,
    code: String(snapshot.code),
    academicYear: Number(snapshot.year),
    contentHash: String(snapshot.content_hash),
    course,
    structure,
    requirements,
    evidence: [],
    flags: [],
  };
}

/** Content hash over everything that reaches the database, ignoring provenance. */
export function contentHashForWrite(write: CatalogueSnapshotWrite) {
  return stableFingerprint({
    kind: write.kind,
    code: write.code,
    academicYear: write.academicYear,
    course: write.course,
    structure: write.structure,
    requirements: write.requirements,
  });
}
