import type { PendingCatalogueImport } from "./pending-catalogue-import";
import { originalStructureImportSnapshotId } from "./structure-snapshot-ancestry";
import "server-only";
import { cumulativeGrowthSeries } from "@/lib/coursemap/admin-catalogue-history";
import {
  parseAcademicStructureManualSnapshotProjection,
  type AcademicStructureManualSnapshotProjection,
} from "@/lib/structure-import/manual-snapshot";
import {
  isAcademicStructureKind,
  type AcademicStructureKind,
} from "@/lib/structure-import/contract";
import { createClient } from "@/lib/supabase/server";

export type AdminCatalogueSummary = {
  courseDrafts: number;
  courseHistory: number[];
  courses: number;
  draftHistory: number[];
  programmeHistory: number[];
  programmes: number;
  structureDrafts: number;
};

const STRUCTURE_KINDS = [
  "programme",
  "major",
  "minor",
  "specialisation",
] as const;

export async function loadAdminCatalogueSummary(): Promise<AdminCatalogueSummary> {
  const supabase = await createClient();
  const [
    courses,
    courseDrafts,
    courseCreated,
    courseDraftCreated,
    programmes,
    structureDrafts,
    programmeCreated,
    structureDraftCreated,
  ] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase
      .from("course_years")
      .select("id", { count: "exact", head: true })
      .not("draft_snapshot_id", "is", null),
    supabase.from("courses").select("created_at").limit(5000),
    supabase
      .from("course_years")
      .select("created_at")
      .not("draft_snapshot_id", "is", null)
      .limit(5000),
    supabase
      .from("academic_structures")
      .select("id", { count: "exact", head: true })
      .eq("kind", "programme"),
    supabase
      .from("academic_structure_years")
      .select("id", { count: "exact", head: true })
      .not("draft_snapshot_id", "is", null),
    supabase
      .from("academic_structures")
      .select("created_at")
      .eq("kind", "programme")
      .limit(5000),
    supabase
      .from("academic_structure_years")
      .select("created_at")
      .not("draft_snapshot_id", "is", null)
      .limit(5000),
  ]);
  const error = [
    courses,
    courseDrafts,
    courseCreated,
    courseDraftCreated,
    programmes,
    structureDrafts,
    programmeCreated,
    structureDraftCreated,
  ]
    .map((result) => result.error)
    .find(Boolean);
  if (error) throw error;

  return {
    courses: courses.count ?? 0,
    courseDrafts: courseDrafts.count ?? 0,
    courseHistory: cumulativeGrowthSeries(
      (courseCreated.data ?? []).map((row) => row.created_at),
    ),
    programmes: programmes.count ?? 0,
    structureDrafts: structureDrafts.count ?? 0,
    programmeHistory: cumulativeGrowthSeries(
      (programmeCreated.data ?? []).map((row) => row.created_at),
    ),
    draftHistory: cumulativeGrowthSeries([
      ...(courseDraftCreated.data ?? []).map((row) => row.created_at),
      ...(structureDraftCreated.data ?? []).map((row) => row.created_at),
    ]),
  };
}

export const PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type AdminStructureReviewCondition = {
  courseCode: string | null;
  id: number;
  kind: string;
  maximumLevel: number | null;
  minimumLevel: number | null;
  minimumUnits: number | null;
  optionCodes: string[];
  sourceText: string | null;
  subjectCode: string | null;
  targetStructureCode: string | null;
  targetStructureKind: AcademicStructureKind | null;
};

export type AdminStructureReviewGroup = {
  code: string;
  conditions: AdminStructureReviewCondition[];
  description: string | null;
  id: number;
  minimumCount: number | null;
  minimumUnits: number | null;
  name: string;
  operator: string;
  parentGroupId: number | null;
};

export type AdminStructureReviewRecord = {
  reviewIssues?: {
    id: string;
    message: string;
    source_text: string | null;
    severity: string;
  }[];
  pendingImports: PendingCatalogueImport[];
  draftSnapshotId: number | null;
  publishedSnapshotId: number | null;
  code: string;
  publicId: string;
  description: string;
  groups: AdminStructureReviewGroup[];
  id: number;
  kind: AcademicStructureKind;
  name: string;
  projection: AcademicStructureManualSnapshotProjection;
  sourceOriginalProjection: AcademicStructureManualSnapshotProjection | null;
  publicationStatus: string;
  reviewState: string;
  source: {
    canonicalUrl: string;
    contentHash: string;
    fetchedAt: string;
    lastModified: string | null;
  } | null;
  structureYearId: number;
  units: number | null;
  year: number;
};

async function selectStructureYear(
  structureId: number,
  requestedYear?: number,
) {
  const supabase = await createClient();
  if (requestedYear !== undefined) {
    const { data: academicYear, error: yearError } = await supabase
      .from("academic_years")
      .select("id,year")
      .eq("year", requestedYear)
      .maybeSingle();
    if (yearError) throw yearError;
    if (!academicYear) return null;
    const { data: structureYear, error: structureYearError } = await supabase
      .from("academic_structure_years")
      .select("id,academic_year_id,draft_snapshot_id,published_snapshot_id")
      .eq("structure_id", structureId)
      .eq("academic_year_id", academicYear.id)
      .maybeSingle();
    if (structureYearError) throw structureYearError;
    return structureYear ? { academicYear, structureYear } : null;
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from("academic_structure_years")
    .select("id,academic_year_id,draft_snapshot_id,published_snapshot_id")
    .eq("structure_id", structureId);
  if (candidatesError) throw candidatesError;
  const yearIds = (candidates ?? []).map((row) => row.academic_year_id);
  if (yearIds.length === 0) return null;
  const { data: years, error: yearsError } = await supabase
    .from("academic_years")
    .select("id,year")
    .in("id", yearIds)
    .order("year", { ascending: false });
  if (yearsError) throw yearsError;
  const academicYear = years?.[0];
  if (!academicYear) return null;
  const structureYear = candidates?.find(
    (row) => row.academic_year_id === academicYear.id,
  );
  return structureYear ? { academicYear, structureYear } : null;
}

/** Load the current draft, falling back to the published snapshot. */
export async function loadAdminStructureReview(
  identifier: string,
  requestedYear?: number,
  requestedSnapshotId?: number,
): Promise<AdminStructureReviewRecord | null> {
  const value = identifier.trim();
  const publicId = PUBLIC_ID_PATTERN.test(value) ? value : null;
  const code = publicId ? null : value.toUpperCase();
  if (!publicId && !/^[A-Z0-9][A-Z0-9-]*$/.test(code ?? "")) return null;

  const supabase = await createClient();
  let structureQuery = supabase
    .from("academic_structures")
    .select("id,code,kind,public_id");
  structureQuery = publicId
    ? structureQuery.eq("public_id", publicId)
    : structureQuery.eq("code", code as string);
  const { data: structures, error: structureError } = await structureQuery
    .in("kind", [...STRUCTURE_KINDS])
    .limit(1);
  if (structureError) throw structureError;
  const structure = structures?.[0];
  if (!structure) return null;

  const selection = await selectStructureYear(structure.id, requestedYear);
  if (!selection) return null;
  const { academicYear, structureYear } = selection;
  let snapshotId =
    requestedSnapshotId ??
    structureYear.draft_snapshot_id ??
    structureYear.published_snapshot_id;
  if (snapshotId === null) {
    // Older imports can predate automatic draft preparation. Keep their
    // candidate reviewable without silently rewriting catalogue history.
    const { data: candidate, error: candidateError } = await supabase
      .from("academic_structure_import_targets")
      .select("candidate_snapshot_id")
      .eq("structure_year_id", structureYear.id)
      .eq("processing_status", "succeeded")
      .eq("review_status", "needs_review")
      .not("candidate_snapshot_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (candidateError) throw candidateError;
    snapshotId = candidate?.candidate_snapshot_id ?? null;
  }
  if (snapshotId === null) return null;

  const [
    snapshotResult,
    summaryFieldsResult,
    sectionsResult,
    outcomesResult,
    feesResult,
    relationshipsResult,
    groupsResult,
    conditionsResult,
    optionsResult,
    unmodelledResult,
    evidenceResult,
  ] = await Promise.all([
    supabase
      .from("academic_structure_snapshots")
      .select(
        "academic_career,acronym,atar,can_combine,can_combine_vertical,college,confirmation_status,contact_text,critical_uncertainty,description,duration_years,id,introduction,mode_of_delivery,name,overall_confidence,schema_version,selection_rank,short_name,source_page_id,study_as,units",
      )
      .eq("id", snapshotId)
      .eq("structure_year_id", structureYear.id)
      .maybeSingle(),
    supabase
      .from("academic_structure_summary_fields")
      .select("field_key,field_value,label,position,source_text,value_position")
      .eq("snapshot_id", snapshotId)
      .order("position")
      .order("value_position"),
    supabase
      .from("academic_structure_snapshot_sections")
      .select(
        "heading,id,markdown,position,section_key,source_locator,source_text",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_learning_outcomes")
      .select("id,outcome_text,position,source_locator,source_text")
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_fees")
      .select(
        "amount,audience,basis,currency,fee_type,fee_year,id,position,source_label,source_locator,source_text",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_snapshot_relationships")
      .select(
        "id,position,relationship_kind,source_locator,source_text,target_code,target_kind,target_title",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_requirement_groups")
      .select(
        "description,group_key,id,maximum_units,minimum_count,minimum_units,operator,parent_group_id,position,source_locator,source_text,title",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_requirement_conditions")
      .select(
        "condition_kind,free_text,id,maximum_level,maximum_units,minimum_courses,minimum_level,minimum_units,position,projection_key,requirement_group_id,source_locator,source_text,structure_kind,subject_code,tag",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_requirement_options")
      .select(
        "option_code,option_kind,position,requirement_condition_id,structure_kind",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_unmodelled_requirements")
      .select("id,position,source_locator,source_text")
      .eq("snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("academic_structure_snapshot_evidence")
      .select(
        "confidence,evidence_excerpt,field_key,method,position,source_locator",
      )
      .eq("snapshot_id", snapshotId)
      .order("position"),
  ]);
  const readError = [
    snapshotResult,
    summaryFieldsResult,
    sectionsResult,
    outcomesResult,
    feesResult,
    relationshipsResult,
    groupsResult,
    conditionsResult,
    optionsResult,
    unmodelledResult,
    evidenceResult,
  ]
    .map((result) => result.error)
    .find(Boolean);
  if (readError) throw readError;
  const snapshot = snapshotResult.data;
  if (!snapshot) return null;

  const [sourceResult, reviewResult] = await Promise.all([
    snapshot.source_page_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("academic_structure_source_pages")
          .select(
            "canonical_url,content_sha256,fetched_at,source_last_modified",
          )
          .eq("id", snapshot.source_page_id)
          .maybeSingle(),
    supabase
      .from("academic_structure_review_items")
      .select("id,message,source_text,severity", { count: "exact" })
      .eq("snapshot_id", snapshotId)
      .eq("status", "open"),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (reviewResult.error) throw reviewResult.error;

  const { data: pendingTargets, error: pendingError } = await supabase
    .from("academic_structure_import_targets")
    .select(
      "id,run_id,candidate_snapshot_id,baseline_draft_snapshot_id,baseline_published_snapshot_id,review_status,created_at",
    )
    .eq("structure_year_id", structureYear.id)
    .eq("processing_status", "succeeded")
    .eq("review_status", "needs_review")
    .not("candidate_snapshot_id", "is", null)
    .order("created_at", { ascending: false });
  if (pendingError) throw pendingError;

  const { data: snapshotAncestry, error: ancestryError } = await supabase
    .from("academic_structure_snapshots")
    .select("id,parent_snapshot_id,origin")
    .eq("structure_year_id", structureYear.id);
  if (ancestryError) throw ancestryError;
  const parentsById = new Map(
    (snapshotAncestry ?? []).map((item) => [item.id, item.parent_snapshot_id]),
  );
  const currentDraftAncestry = new Set<number>();
  let ancestorId = structureYear.draft_snapshot_id;
  while (ancestorId !== null && !currentDraftAncestry.has(ancestorId)) {
    currentDraftAncestry.add(ancestorId);
    ancestorId = parentsById.get(ancestorId) ?? null;
  }

  const originalImportId = originalStructureImportSnapshotId(
    snapshotId,
    snapshotAncestry ?? [],
  );

  const conditions = conditionsResult.data ?? [];
  const options = optionsResult.data ?? [];
  const needsReview =
    snapshot.critical_uncertainty ||
    snapshot.confirmation_status === "required" ||
    (reviewResult.count ?? 0) > 0;

  const groupKeyById = new Map(
    (groupsResult.data ?? []).map((group) => [group.id, group.group_key]),
  );
  const conditionKeyById = new Map(
    conditions.map((condition) => [condition.id, condition.projection_key]),
  );
  const rootGroup = (groupsResult.data ?? []).find(
    ({ parent_group_id: parentGroupId }) => parentGroupId === null,
  );
  const projection = parseAcademicStructureManualSnapshotProjection({
    schemaVersion: snapshot.schema_version,
    structureKind: structure.kind,
    structureCode: structure.code,
    academicYear: academicYear.year,
    snapshot: {
      title: snapshot.name,
      acronym: snapshot.acronym,
      shortName: snapshot.short_name,
      introduction: snapshot.introduction,
      description: snapshot.description,
      totalUnits: snapshot.units === null ? null : Number(snapshot.units),
      durationYears:
        snapshot.duration_years === null
          ? null
          : Number(snapshot.duration_years),
      academicCareer: snapshot.academic_career,
      college: snapshot.college,
      deliveryMode: snapshot.mode_of_delivery,
      selectionRank:
        snapshot.selection_rank === null
          ? null
          : Number(snapshot.selection_rank),
      atar: snapshot.atar === null ? null : Number(snapshot.atar),
      canCombine: snapshot.can_combine,
      canCombineVertical: snapshot.can_combine_vertical,
      studyAs: snapshot.study_as,
      contactText: snapshot.contact_text,
      overallConfidence:
        snapshot.overall_confidence === null
          ? null
          : Number(snapshot.overall_confidence),
    },
    summaryFields: (summaryFieldsResult.data ?? []).map((field) => ({
      position: field.position,
      valuePosition: field.value_position,
      fieldKey: field.field_key,
      label: field.label,
      fieldValue: field.field_value,
      sourceText: field.source_text,
    })),
    sections: (sectionsResult.data ?? []).map((section) => ({
      position: section.position,
      sectionKey: section.section_key,
      heading: section.heading,
      markdown: section.markdown,
      sourceText: section.source_text,
      sourceLocator: section.source_locator,
    })),
    learningOutcomes: (outcomesResult.data ?? []).map((outcome) => ({
      position: outcome.position,
      outcomeText: outcome.outcome_text,
      sourceText: outcome.source_text,
      sourceLocator: outcome.source_locator,
    })),
    fees: (feesResult.data ?? []).map((fee) => ({
      position: fee.position,
      feeYear: fee.fee_year,
      audience: fee.audience,
      feeType: fee.fee_type,
      amount: fee.amount === null ? null : Number(fee.amount),
      currency: fee.currency === null ? null : fee.currency.trim(),
      basis: fee.basis,
      sourceLabel: fee.source_label,
      sourceText: fee.source_text,
      sourceLocator: fee.source_locator,
    })),
    relationships: (relationshipsResult.data ?? []).map((relationship) => ({
      position: relationship.position,
      relationshipKind: relationship.relationship_kind,
      targetKind: relationship.target_kind,
      targetCode: relationship.target_code,
      targetTitle: relationship.target_title,
      sourceText: relationship.source_text,
      sourceLocator: relationship.source_locator,
    })),
    requirementRootKey: rootGroup?.group_key ?? null,
    requirementGroups: (groupsResult.data ?? []).map((group) => ({
      key: group.group_key,
      parentGroupKey:
        group.parent_group_id === null
          ? null
          : (groupKeyById.get(group.parent_group_id) ?? null),
      position: group.position,
      operator: group.operator,
      minimumCount: group.minimum_count,
      minimumUnits:
        group.minimum_units === null ? null : Number(group.minimum_units),
      maximumUnits:
        group.maximum_units === null ? null : Number(group.maximum_units),
      title: group.title,
      description: group.description,
      sourceText: group.source_text,
      sourceLocator: group.source_locator,
    })),
    requirementConditions: conditions.map((condition) => ({
      key: condition.projection_key,
      groupKey: groupKeyById.get(condition.requirement_group_id),
      position: condition.position,
      conditionKind: condition.condition_kind,
      minimumUnits:
        condition.minimum_units === null
          ? null
          : Number(condition.minimum_units),
      maximumUnits:
        condition.maximum_units === null
          ? null
          : Number(condition.maximum_units),
      minimumCourses: condition.minimum_courses,
      structureKind: condition.structure_kind,
      subjectCode: condition.subject_code,
      minimumLevel: condition.minimum_level,
      maximumLevel: condition.maximum_level,
      tag: condition.tag,
      freeText: condition.free_text,
      sourceText: condition.source_text,
      sourceLocator: condition.source_locator,
    })),
    requirementOptions: options.map((option) => ({
      conditionKey: conditionKeyById.get(option.requirement_condition_id),
      position: option.position,
      optionKind: option.option_kind,
      optionCode: option.option_code,
      structureKind: option.structure_kind,
    })),
    unmodelledRequirements: (unmodelledResult.data ?? []).map((item) => ({
      position: item.position,
      sourceText: item.source_text,
      sourceLocator: item.source_locator,
    })),
    evidence: (evidenceResult.data ?? []).map((item) => ({
      position: item.position,
      fieldKey: item.field_key,
      sourceLocator: item.source_locator,
      evidenceExcerpt: item.evidence_excerpt,
      confidence: Number(item.confidence),
      method: item.method,
    })),
  });

  const sourceOriginalProjection =
    originalImportId === null
      ? null
      : originalImportId === snapshotId
        ? projection
        : ((
            await loadAdminStructureReview(
              structure.public_id,
              academicYear.year,
              originalImportId,
            )
          )?.projection ?? null);

  return {
    code: structure.code,
    draftSnapshotId: structureYear.draft_snapshot_id,
    publishedSnapshotId: structureYear.published_snapshot_id,
    pendingImports: (pendingTargets ?? []).flatMap((target) =>
      target.candidate_snapshot_id === null
        ? []
        : [
            {
              targetId: target.id,
              runId: target.run_id,
              candidateSnapshotId: target.candidate_snapshot_id,
              isCurrentDraftSource:
                target.baseline_draft_snapshot_id === null &&
                target.baseline_published_snapshot_id === null &&
                currentDraftAncestry.has(target.candidate_snapshot_id),
              baselineDraftSnapshotId: target.baseline_draft_snapshot_id,
              baselinePublishedSnapshotId:
                target.baseline_published_snapshot_id,
              reviewStatus: target.review_status,
              createdAt: target.created_at,
            },
          ],
    ),
    publicId: structure.public_id,
    description: snapshot.description ?? "",
    groups: (groupsResult.data ?? []).map((group) => ({
      code: group.group_key,
      conditions: conditions
        .filter((condition) => condition.requirement_group_id === group.id)
        .map((condition) => {
          const conditionOptions = options.filter(
            (option) => option.requirement_condition_id === condition.id,
          );
          const onlyOption =
            conditionOptions.length === 1 ? conditionOptions[0] : null;
          return {
            courseCode:
              onlyOption?.option_kind === "course"
                ? onlyOption.option_code
                : null,
            id: condition.id,
            kind: condition.condition_kind,
            maximumLevel: condition.maximum_level,
            minimumLevel: condition.minimum_level,
            minimumUnits:
              condition.minimum_units === null
                ? null
                : Number(condition.minimum_units),
            optionCodes: conditionOptions.map((option) => option.option_code),
            sourceText: condition.free_text ?? condition.source_text,
            subjectCode: condition.subject_code,
            targetStructureCode:
              onlyOption?.option_kind === "structure"
                ? onlyOption.option_code
                : null,
            targetStructureKind:
              onlyOption?.option_kind === "structure" &&
              isAcademicStructureKind(onlyOption.structure_kind)
                ? onlyOption.structure_kind
                : null,
          };
        }),
      description: group.description,
      id: group.id,
      minimumCount: group.minimum_count,
      minimumUnits:
        group.minimum_units === null ? null : Number(group.minimum_units),
      name: group.title ?? group.group_key,
      operator: group.operator,
      parentGroupId: group.parent_group_id,
    })),
    id: snapshot.id,
    kind: structure.kind as AcademicStructureKind,
    name: snapshot.name,
    projection,
    sourceOriginalProjection,
    publicationStatus:
      structureYear.published_snapshot_id === snapshot.id
        ? "published"
        : structureYear.draft_snapshot_id === snapshot.id
          ? "draft"
          : "candidate",
    reviewState: needsReview ? "needs_review" : "verified",
    reviewIssues: reviewResult.data ?? [],
    source: sourceResult.data
      ? {
          canonicalUrl: sourceResult.data.canonical_url,
          contentHash: sourceResult.data.content_sha256,
          fetchedAt: sourceResult.data.fetched_at,
          lastModified: sourceResult.data.source_last_modified,
        }
      : null,
    structureYearId: structureYear.id,
    units: snapshot.units === null ? null : Number(snapshot.units),
    year: academicYear.year,
  };
}
