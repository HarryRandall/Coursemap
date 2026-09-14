import "server-only";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_IMPORT_LIST_SORT,
  importSortOrder,
  importStatusFilter,
  MAX_SEARCH_ENTRY_IDS,
  safeImportSearch,
  type ImportListSort,
  type ImportListStatus,
} from "@/lib/coursemap/import-list-query";

export type AcademicStructureImportKind =
  "programme" | "major" | "minor" | "specialisation";

type TargetRow =
  Database["public"]["Tables"]["academic_structure_import_targets"]["Row"];
type ExtractionRow =
  Database["public"]["Tables"]["academic_structure_extractions"]["Row"];
type SnapshotRow =
  Database["public"]["Tables"]["academic_structure_snapshots"]["Row"];
type StructureYearRow =
  Database["public"]["Tables"]["academic_structure_years"]["Row"];
type StructureRow = Database["public"]["Tables"]["academic_structures"]["Row"];

export type AcademicStructureImportSummary = {
  id: string;
  structureCode: string;
  structureTitle: string;
  structureKind: AcademicStructureImportKind;
  academicYear: number;
  processingStatus: string;
  reviewStatus: string;
  changeKind: string | null;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AcademicStructureImportPage = {
  records: AcademicStructureImportSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type AcademicStructureImportArtifact = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
  createdAt: string;
};

export type AcademicStructureImportReviewItem =
  Database["public"]["Tables"]["academic_structure_review_items"]["Row"];

export type AcademicStructureImportRelationalData = {
  academic_structures: StructureRow[];
  academic_structure_years: StructureYearRow[];
  academic_structure_snapshots: SnapshotRow[];
  academic_structure_snapshot_sections: Array<
    Database["public"]["Tables"]["academic_structure_snapshot_sections"]["Row"]
  >;
  academic_structure_summary_fields: Array<
    Database["public"]["Tables"]["academic_structure_summary_fields"]["Row"]
  >;
  academic_structure_learning_outcomes: Array<
    Database["public"]["Tables"]["academic_structure_learning_outcomes"]["Row"]
  >;
  academic_structure_fees: Array<
    Database["public"]["Tables"]["academic_structure_fees"]["Row"]
  >;
  academic_structure_snapshot_relationships: Array<
    Database["public"]["Tables"]["academic_structure_snapshot_relationships"]["Row"]
  >;
  academic_structure_requirement_groups: Array<
    Database["public"]["Tables"]["academic_structure_requirement_groups"]["Row"]
  >;
  academic_structure_requirement_conditions: Array<
    Database["public"]["Tables"]["academic_structure_requirement_conditions"]["Row"]
  >;
  academic_structure_requirement_options: Array<
    Database["public"]["Tables"]["academic_structure_requirement_options"]["Row"]
  >;
  academic_structure_unmodelled_requirements: Array<
    Database["public"]["Tables"]["academic_structure_unmodelled_requirements"]["Row"]
  >;
  academic_structure_snapshot_evidence: Array<
    Database["public"]["Tables"]["academic_structure_snapshot_evidence"]["Row"]
  >;
  academic_structure_review_items: AcademicStructureImportReviewItem[];
};

export type AcademicStructureImportTargetDetail = {
  run: {
    id: string;
    runNumber: number;
    academicYear: number;
    structureKind: AcademicStructureImportKind;
    status: string;
    requestedModel: string;
  };
  target: {
    id: string;
    code: string;
    title: string | null;
    processingStatus: string;
    reviewStatus: string;
    changeKind: string | null;
    attemptCount: number;
    baselineDraftSnapshotId: number | null;
    baselinePublishedSnapshotId: number | null;
    candidateSnapshotId: number | null;
    currentDraftSnapshotId: number | null;
    currentPublishedSnapshotId: number | null;
    structureId: number | null;
    structurePublicId: string | null;
    structureYearId: number | null;
    errorCode: string | null;
    errorSummary: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  candidateSnapshot: SnapshotRow | null;
  previousSnapshot: {
    row: SnapshotRow;
    label: string;
  } | null;
  sourcePage:
    | Database["public"]["Tables"]["academic_structure_source_pages"]["Row"]
    | null;
  stages: Array<
    Database["public"]["Tables"]["academic_structure_import_stages"]["Row"]
  >;
  artifacts: AcademicStructureImportArtifact[];
  extractions: ExtractionRow[];
  reviewItems: AcademicStructureImportReviewItem[];
  relationalData: AcademicStructureImportRelationalData;
};

function safePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

/**
 * Each kind lists its own imports. The run that batched them is an
 * implementation detail of the worker, not something an editor navigates.
 */
export async function loadAcademicStructureImportPage({
  structureKind,
  page: requestedPage,
  pageSize = 20,
  query,
  sort = DEFAULT_IMPORT_LIST_SORT,
  status = "all",
  statusNegated = false,
}: {
  structureKind: AcademicStructureImportKind;
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: ImportListSort;
  status?: ImportListStatus;
  statusNegated?: boolean;
}): Promise<AcademicStructureImportPage> {
  const page = safePage(requestedPage);
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize), 1), 50);

  const supabase = await createClient();
  const from = (page - 1) * safePageSize;
  const search = safeImportSearch(query);

  // Titles live on the directory entry, so a search resolves to entry ids
  // first and the target list is narrowed to them.
  let entryIds: number[] | null = null;
  if (search) {
    const { data: matches, error: matchError } = await supabase
      .from("academic_structure_directory_entries")
      .select("id")
      .or(`code.ilike.*${search}*,title.ilike.*${search}*`)
      .limit(MAX_SEARCH_ENTRY_IDS);
    if (matchError) throw matchError;
    entryIds = (matches ?? []).map((row) => row.id);
    if (entryIds.length === 0) {
      return { records: [], page, pageSize: safePageSize, total: 0 };
    }
  }

  let targetsQuery = supabase
    .from("academic_structure_import_targets")
    .select("*", { count: "exact" })
    .eq("structure_kind", structureKind);
  if (entryIds) targetsQuery = targetsQuery.in("directory_entry_id", entryIds);
  const statusFilter = importStatusFilter("structure", status);
  if (statusFilter) {
    targetsQuery = statusNegated
      ? targetsQuery.not(
          statusFilter.column,
          "in",
          `(${statusFilter.values.join(",")})`,
        )
      : targetsQuery.in(statusFilter.column, statusFilter.values);
  }
  const order = importSortOrder(sort, "structure_code");
  const { data, count, error } = await targetsQuery
    .order(order.column, { ascending: order.ascending })
    .range(from, from + safePageSize - 1);
  if (error) throw error;
  const targets = (data ?? []) as TargetRow[];
  if (targets.length === 0) {
    return { records: [], page, pageSize: safePageSize, total: count ?? 0 };
  }

  const [yearsResult, entriesResult] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .in("id", [...new Set(targets.map((target) => target.academic_year_id))]),
    supabase
      .from("academic_structure_directory_entries")
      .select("id,title")
      .in("id", [
        ...new Set(targets.map((target) => target.directory_entry_id)),
      ]),
  ]);
  if (yearsResult.error) throw yearsResult.error;
  if (entriesResult.error) throw entriesResult.error;
  const yearById = new Map(
    (yearsResult.data ?? []).map((row) => [row.id, row.year]),
  );
  const titleById = new Map(
    (entriesResult.data ?? []).map((row) => [row.id, row.title]),
  );

  return {
    records: targets.map((target) => ({
      id: target.id,
      structureCode: target.structure_code,
      structureTitle: titleById.get(target.directory_entry_id) ?? "",
      structureKind: target.structure_kind as AcademicStructureImportKind,
      academicYear: yearById.get(target.academic_year_id) ?? 0,
      processingStatus: target.processing_status,
      reviewStatus: target.review_status,
      changeKind: target.change_kind,
      errorSummary: target.error_summary,
      createdAt: target.created_at,
      startedAt: target.started_at,
      finishedAt: target.finished_at,
    })),
    page,
    pageSize: safePageSize,
    total: count ?? 0,
  };
}

function emptyRelationalData(): AcademicStructureImportRelationalData {
  return {
    academic_structures: [],
    academic_structure_years: [],
    academic_structure_snapshots: [],
    academic_structure_snapshot_sections: [],
    academic_structure_summary_fields: [],
    academic_structure_learning_outcomes: [],
    academic_structure_fees: [],
    academic_structure_snapshot_relationships: [],
    academic_structure_requirement_groups: [],
    academic_structure_requirement_conditions: [],
    academic_structure_requirement_options: [],
    academic_structure_unmodelled_requirements: [],
    academic_structure_snapshot_evidence: [],
    academic_structure_review_items: [],
  };
}

async function loadSnapshotRelationalData({
  snapshot,
  structure,
  structureYear,
}: {
  snapshot: SnapshotRow | null;
  structure: StructureRow | null;
  structureYear: StructureYearRow | null;
}): Promise<AcademicStructureImportRelationalData> {
  const relationalData = emptyRelationalData();
  if (structure) relationalData.academic_structures = [structure];
  if (structureYear) relationalData.academic_structure_years = [structureYear];
  if (!snapshot) return relationalData;
  relationalData.academic_structure_snapshots = [snapshot];

  const supabase = await createClient();
  const results = await Promise.all([
    supabase
      .from("academic_structure_snapshot_sections")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_summary_fields")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position")
      .order("value_position"),
    supabase
      .from("academic_structure_learning_outcomes")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_fees")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_snapshot_relationships")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_requirement_groups")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_requirement_conditions")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_requirement_options")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_unmodelled_requirements")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
    supabase
      .from("academic_structure_snapshot_evidence")
      .select("*")
      .eq("snapshot_id", snapshot.id)
      .order("position"),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  const [
    sections,
    summaryFields,
    learningOutcomes,
    fees,
    relationships,
    requirementGroups,
    requirementConditions,
    requirementOptions,
    unmodelledRequirements,
    evidence,
  ] = results;

  return {
    ...relationalData,
    academic_structure_snapshot_sections: sections.data ?? [],
    academic_structure_summary_fields: summaryFields.data ?? [],
    academic_structure_learning_outcomes: learningOutcomes.data ?? [],
    academic_structure_fees: fees.data ?? [],
    academic_structure_snapshot_relationships: relationships.data ?? [],
    academic_structure_requirement_groups: requirementGroups.data ?? [],
    academic_structure_requirement_conditions: requirementConditions.data ?? [],
    academic_structure_requirement_options: requirementOptions.data ?? [],
    academic_structure_unmodelled_requirements:
      unmodelledRequirements.data ?? [],
    academic_structure_snapshot_evidence: evidence.data ?? [],
  };
}

/**
 * Target ids are unique, so the review page addresses one without its run. The
 * kind is still checked so a major's import cannot be opened under /minors.
 */
export async function loadAcademicStructureImportTargetDetail({
  structureKind,
  targetId,
  includeRelationalData = true,
}: {
  structureKind: AcademicStructureImportKind;
  targetId: string;
  includeRelationalData?: boolean;
}): Promise<AcademicStructureImportTargetDetail | null> {
  const supabase = await createClient();
  const { data: targetData, error: targetError } = await supabase
    .from("academic_structure_import_targets")
    .select("*")
    .eq("id", targetId)
    .eq("structure_kind", structureKind)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetData) return null;
  const target = targetData as TargetRow;
  const runId = target.run_id;

  const [
    runResult,
    yearResult,
    directoryResult,
    stagesResult,
    artifactsResult,
    extractionsResult,
    reviewItemsResult,
  ] = await Promise.all([
    supabase
      .from("academic_structure_import_runs")
      .select("id,run_number,status,structure_kind,requested_model")
      .eq("id", runId)
      .single(),
    supabase
      .from("academic_years")
      .select("year")
      .eq("id", target.academic_year_id)
      .single(),
    supabase
      .from("academic_structure_directory_entries")
      .select("title")
      .eq("id", target.directory_entry_id)
      .single(),
    supabase
      .from("academic_structure_import_stages")
      .select("*")
      .eq("target_id", target.id)
      .order("position"),
    supabase
      .from("academic_structure_import_artifacts")
      .select("*")
      .eq("target_id", target.id)
      .order("attempt_number", { ascending: false }),
    supabase
      .from("academic_structure_extractions")
      .select("*")
      .eq("target_id", target.id)
      .order("extraction_number", { ascending: false }),
    supabase
      .from("academic_structure_review_items")
      .select("*")
      .eq("target_id", target.id)
      .order("created_at"),
  ]);
  const requiredResults = [
    runResult,
    yearResult,
    directoryResult,
    stagesResult,
    artifactsResult,
    extractionsResult,
    reviewItemsResult,
  ];
  const failed = requiredResults.find((result) => result.error);
  if (failed?.error) throw failed.error;
  if (!runResult.data || !yearResult.data || !directoryResult.data) {
    throw new Error(
      "The academic structure import returned incomplete metadata.",
    );
  }
  const runMetadata = runResult.data;
  const academicYear = yearResult.data.year;
  const directoryTitle = directoryResult.data.title;

  const [
    snapshotResult,
    structureYearResult,
    sourcePageResult,
    structureResult,
  ] = await Promise.all([
    target.candidate_snapshot_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("academic_structure_snapshots")
          .select("*")
          .eq("id", target.candidate_snapshot_id)
          .single(),
    target.structure_year_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("academic_structure_years")
          .select("*")
          .eq("id", target.structure_year_id)
          .single(),
    target.source_page_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("academic_structure_source_pages")
          .select("*")
          .eq("id", target.source_page_id)
          .single(),
    target.structure_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("academic_structures")
          .select("*")
          .eq("id", target.structure_id)
          .single(),
  ]);
  const secondaryResults = [
    snapshotResult,
    structureYearResult,
    sourcePageResult,
    structureResult,
  ];
  const secondaryFailure = secondaryResults.find((result) => result.error);
  if (secondaryFailure?.error) throw secondaryFailure.error;

  const candidateSnapshot = snapshotResult.data as SnapshotRow | null;
  const structureYear = structureYearResult.data as StructureYearRow | null;
  const structure = structureResult.data as StructureRow | null;
  const previousChoices = [
    {
      id: target.baseline_draft_snapshot_id,
      label: "Draft when the import started",
    },
    {
      id: target.baseline_published_snapshot_id,
      label: "Published snapshot when the import started",
    },
    { id: structureYear?.draft_snapshot_id ?? null, label: "Current draft" },
    {
      id: structureYear?.published_snapshot_id ?? null,
      label: "Current published snapshot",
    },
  ];
  const previousChoice = previousChoices.find(
    (choice) =>
      choice.id !== null && choice.id !== target.candidate_snapshot_id,
  );
  const previousSnapshotId = previousChoice?.id ?? null;
  const previousSnapshotResult =
    includeRelationalData && previousSnapshotId !== null
      ? await supabase
          .from("academic_structure_snapshots")
          .select("*")
          .eq("id", previousSnapshotId)
          .single()
      : { data: null, error: null };
  if (previousSnapshotResult.error) throw previousSnapshotResult.error;

  const relationalData = await loadSnapshotRelationalData({
    snapshot: includeRelationalData ? candidateSnapshot : null,
    structure,
    structureYear,
  });
  relationalData.academic_structure_review_items = reviewItemsResult.data ?? [];

  return {
    run: {
      id: runMetadata.id,
      runNumber: runMetadata.run_number,
      academicYear,
      structureKind: runMetadata.structure_kind as AcademicStructureImportKind,
      status: runMetadata.status,
      requestedModel: runMetadata.requested_model,
    },
    target: {
      id: target.id,
      code: target.structure_code,
      title: directoryTitle,
      processingStatus: target.processing_status,
      reviewStatus: target.review_status,
      changeKind: target.change_kind,
      attemptCount: target.attempt_count,
      baselineDraftSnapshotId: target.baseline_draft_snapshot_id,
      baselinePublishedSnapshotId: target.baseline_published_snapshot_id,
      candidateSnapshotId: target.candidate_snapshot_id,
      currentDraftSnapshotId: structureYear?.draft_snapshot_id ?? null,
      currentPublishedSnapshotId: structureYear?.published_snapshot_id ?? null,
      structureId: target.structure_id,
      structurePublicId: structureYear?.public_id ?? null,
      structureYearId: target.structure_year_id,
      errorCode: target.error_code,
      errorSummary: target.error_summary,
      createdAt: target.created_at,
      finishedAt: target.finished_at,
    },
    candidateSnapshot,
    previousSnapshot:
      previousChoice && previousSnapshotResult.data
        ? {
            row: previousSnapshotResult.data as SnapshotRow,
            label: previousChoice.label,
          }
        : null,
    sourcePage: sourcePageResult.data,
    stages: stagesResult.data ?? [],
    artifacts: (artifactsResult.data ?? []).map((artifact) => ({
      id: artifact.id,
      kind: artifact.artifact_kind,
      attemptNumber: artifact.attempt_number,
      mediaType: artifact.media_type,
      byteSize: artifact.byte_size,
      contentSha256: artifact.content_sha256,
      createdAt: artifact.created_at,
    })),
    extractions: (extractionsResult.data ?? []) as ExtractionRow[],
    reviewItems: reviewItemsResult.data ?? [],
    relationalData,
  };
}
