import "server-only";
import type { Database } from "@/types/database";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";
import { createClient } from "@/lib/supabase/server";

export const ACADEMIC_STRUCTURE_IMPORT_YEARS = Array.from(
  { length: 11 },
  (_, index) => 2020 + index,
);

export type AcademicStructureDirectoryStatus =
  | "all"
  | "directory"
  | "queued"
  | "processing"
  | "needs-review"
  | "draft"
  | "draft-changes"
  | "published"
  | "unchanged"
  | "failed";

export type AcademicStructureDirectoryAvailability =
  "all" | "available" | "unavailable";

export type AcademicStructureDirectorySort =
  "code-asc" | "code-desc" | "title-asc" | "title-desc" | "status";

export type AcademicStructureYearOption = {
  id: number | null;
  year: number;
  importEnabled: boolean;
  sourceAvailability: "available" | "unavailable" | "unknown";
  availabilityCheckedAt: string | null;
  availabilityNote: string | null;
  directoryRefreshedAt: string | null;
  receivedCount: number | null;
  uniqueCount: number | null;
};

export type AcademicStructureDirectoryRecord = {
  id: number;
  /** The academic year this directory entry belongs to. */
  year: number;
  kind: AcademicStructureKind;
  code: string;
  title: string;
  shortTitle: string | null;
  academicCareer: string | null;
  durationYears: number | null;
  units: number | null;
  modeOfDelivery: string | null;
  selectionRank: number | null;
  sourceUrl: string;
  isAvailable: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  structureId: number | null;
  structurePublicId: string | null;
  structureYearId: number | null;
  draftSnapshotId: number | null;
  publishedSnapshotId: number | null;
  importStatus: Exclude<AcademicStructureDirectoryStatus, "all">;
  latestImport: {
    runId: string;
    runNumber: number;
    targetId: string;
    processingStatus: string;
    reviewStatus: string;
    changeKind: string | null;
    errorSummary: string | null;
    createdAt: string;
  } | null;
};

export type AcademicStructureDirectoryPage = {
  kind: AcademicStructureKind;
  /**
   * The year the year-scoped controls act on. When allYears is true this is
   * only the fallback for a refresh or an import, not what the table shows.
   */
  year: AcademicStructureYearOption;
  /** Every year is listed at once, so per-year actions are unavailable. */
  allYears: boolean;
  years: AcademicStructureYearOption[];
  records: AcademicStructureDirectoryRecord[];
  page: number;
  pageSize: number;
  total: number;
  activeRun: {
    id: string;
    runNumber: number;
    status: string;
    structureKind: AcademicStructureKind;
    targetCount: number;
    processedCount: number;
  } | null;
};

type DirectoryEntryRow =
  Database["public"]["Tables"]["academic_structure_directory_entries"]["Row"];
type LatestImportTargetRow =
  Database["public"]["Views"]["academic_structure_directory_latest_import_targets"]["Row"];
type ImportRunRow =
  Database["public"]["Tables"]["academic_structure_import_runs"]["Row"];
type AcademicStructureRow =
  Database["public"]["Tables"]["academic_structures"]["Row"];
type AcademicStructureYearRow =
  Database["public"]["Tables"]["academic_structure_years"]["Row"];

type CompleteLatestImportTargetRow = LatestImportTargetRow & {
  id: string;
  run_id: string;
  directory_entry_id: number;
  processing_status: string;
  review_status: string;
  created_at: string;
};

function assertCompleteLatestImportTarget(
  target: LatestImportTargetRow,
): asserts target is CompleteLatestImportTargetRow {
  if (
    target.id === null ||
    target.run_id === null ||
    target.directory_entry_id === null ||
    target.processing_status === null ||
    target.review_status === null ||
    target.created_at === null
  ) {
    throw new Error(
      "The academic structure latest-import view returned an incomplete row.",
    );
  }
}

function safePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function safeSearch(value: string | undefined) {
  return (value ?? "")
    .trim()
    .slice(0, 120)
    .replace(/[^A-Za-z0-9 &-]/gu, " ")
    .replace(/\s+/gu, " ");
}

function normaliseAvailability(value: string | null | undefined) {
  return value === "available" || value === "unavailable" ? value : "unknown";
}

function defaultYear(year: number): AcademicStructureYearOption {
  return {
    id: null,
    year,
    importEnabled: false,
    sourceAvailability: "unknown",
    availabilityCheckedAt: null,
    availabilityNote: null,
    directoryRefreshedAt: null,
    receivedCount: null,
    uniqueCount: null,
  };
}

export function academicStructureDirectoryRecordStatus(
  record: Pick<
    AcademicStructureDirectoryRecord,
    "draftSnapshotId" | "latestImport" | "publishedSnapshotId"
  >,
): Exclude<AcademicStructureDirectoryStatus, "all"> {
  const latest = record.latestImport;
  if (latest?.processingStatus === "queued") return "queued";
  if (latest?.processingStatus === "running") return "processing";
  if (
    latest?.processingStatus === "failed" ||
    latest?.processingStatus === "cancelled"
  ) {
    return "failed";
  }
  if (latest?.reviewStatus === "needs_review") return "needs-review";
  if (
    record.draftSnapshotId !== null &&
    record.publishedSnapshotId !== null &&
    record.draftSnapshotId !== record.publishedSnapshotId
  ) {
    return "draft-changes";
  }
  if (record.publishedSnapshotId !== null) return "published";
  if (record.draftSnapshotId !== null) return "draft";
  if (
    latest?.reviewStatus === "unchanged" ||
    latest?.changeKind === "unchanged"
  ) {
    return "unchanged";
  }
  return "directory";
}

export async function loadAcademicStructureYearOptions(
  structureKind: AcademicStructureKind,
): Promise<AcademicStructureYearOption[]> {
  const supabase = await createClient();
  const { data: years, error: yearsError } = await supabase
    .from("academic_years")
    .select("id,year,is_import_enabled")
    .gte("year", ACADEMIC_STRUCTURE_IMPORT_YEARS[0]!)
    .lte("year", ACADEMIC_STRUCTURE_IMPORT_YEARS.at(-1)!)
    .order("year", { ascending: false });
  if (yearsError) throw yearsError;

  const yearIds = (years ?? []).map((year) => year.id);
  const { data: statuses, error: statusesError } = yearIds.length
    ? await supabase
        .from("academic_structure_directory_statuses")
        .select(
          "academic_year_id,availability_checked_at,availability_note,directory_refreshed_at,received_count,source_availability,unique_count",
        )
        .eq("structure_kind", structureKind)
        .in("academic_year_id", yearIds)
    : { data: [], error: null };
  if (statusesError) throw statusesError;

  const yearByNumber = new Map((years ?? []).map((year) => [year.year, year]));
  const statusByYearId = new Map(
    (statuses ?? []).map((status) => [status.academic_year_id, status]),
  );
  return ACADEMIC_STRUCTURE_IMPORT_YEARS.toReversed().map((year) => {
    const row = yearByNumber.get(year);
    if (!row) return defaultYear(year);
    const status = statusByYearId.get(row.id);
    return {
      id: row.id,
      year: row.year,
      importEnabled: row.is_import_enabled,
      sourceAvailability: normaliseAvailability(status?.source_availability),
      availabilityCheckedAt: status?.availability_checked_at ?? null,
      availabilityNote: status?.availability_note ?? null,
      directoryRefreshedAt: status?.directory_refreshed_at ?? null,
      receivedCount: status?.received_count ?? null,
      uniqueCount: status?.unique_count ?? null,
    };
  });
}

export async function loadAcademicStructureDirectoryPage({
  structureKind,
  year,
  page,
  query,
  sort,
  status = "all",
  statusNegated = false,
  availability = "all",
  availabilityNegated = false,
  pageSize = 50,
}: {
  structureKind: AcademicStructureKind;
  year: number | "all";
  page?: number;
  query?: string;
  sort?: AcademicStructureDirectorySort;
  status?: AcademicStructureDirectoryStatus;
  /** Invert the status filter so the page reads "status is not <status>". */
  statusNegated?: boolean;
  availability?: AcademicStructureDirectoryAvailability;
  availabilityNegated?: boolean;
  pageSize?: number;
}): Promise<AcademicStructureDirectoryPage> {
  const currentPage = safePage(page);
  const currentPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const years = await loadAcademicStructureYearOptions(structureKind);
  const allYears = year === "all";
  const currentCalendarYear = new Date().getFullYear();
  // Year-scoped actions still need a concrete year while every year is
  // listed, so this falls back to the current one rather than going null.
  const selectedYear = allYears
    ? (years.find((option) => option.year === currentCalendarYear) ??
      years.at(-1) ??
      years[0]!)
    : (years.find((option) => option.year === year) ?? years[0]!);

  if (selectedYear.id === null) {
    return {
      kind: structureKind,
      year: selectedYear,
      allYears,
      years,
      records: [],
      page: currentPage,
      pageSize: currentPageSize,
      total: 0,
      activeRun: null,
    };
  }

  const supabase = await createClient();
  const activeRunPromise = supabase
    .from("academic_structure_import_runs")
    .select(
      "id,run_number,status,structure_kind,target_count,succeeded_count,failed_count,cancelled_count",
    )
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const yearById = new Map(
    years.flatMap((option) =>
      option.id === null ? [] : [[option.id, option.year] as const],
    ),
  );
  let entriesQuery = supabase
    .from("academic_structure_directory_entries")
    .select("*")
    .eq("structure_kind", structureKind);
  if (!allYears) {
    entriesQuery = entriesQuery.eq("academic_year_id", selectedYear.id);
  }
  if (availability !== "all") {
    const wanted = (availability === "available") !== availabilityNegated;
    entriesQuery = entriesQuery.eq("is_available", wanted);
  }
  const search = safeSearch(query);
  if (search) {
    entriesQuery = entriesQuery.or(
      `code.ilike.*${search}*,title.ilike.*${search}*,short_title.ilike.*${search}*`,
    );
  }

  const [entriesResult, activeRunResult] = await Promise.all([
    entriesQuery.order("code").limit(2000),
    activeRunPromise,
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (activeRunResult.error) throw activeRunResult.error;

  const entries = (entriesResult.data ?? []) as DirectoryEntryRow[];
  const entryIds = entries.map((entry) => entry.id);
  const { data: targetsData, error: targetsError } = entryIds.length
    ? await supabase
        .from("academic_structure_directory_latest_import_targets")
        .select("*")
        .in("directory_entry_id", entryIds)
    : { data: [], error: null };
  if (targetsError) throw targetsError;
  const targets = (targetsData ?? []).map((target) => {
    const row = target as LatestImportTargetRow;
    assertCompleteLatestImportTarget(row);
    return row;
  });
  const latestTargetByEntryId = new Map(
    targets.map((target) => [target.directory_entry_id, target]),
  );
  const runIds = [...new Set(targets.map((target) => target.run_id))];
  const { data: runsData, error: runsError } = runIds.length
    ? await supabase
        .from("academic_structure_import_runs")
        .select("*")
        .in("id", runIds)
    : { data: [], error: null };
  if (runsError) throw runsError;
  const runById = new Map(
    ((runsData ?? []) as ImportRunRow[]).map((run) => [run.id, run]),
  );

  const codes = entries.map((entry) => entry.code);
  const { data: structuresData, error: structuresError } = codes.length
    ? await supabase
        .from("academic_structures")
        .select("id,public_id,code,kind,created_at,updated_at")
        .eq("kind", structureKind)
        .in("code", codes)
    : { data: [], error: null };
  if (structuresError) throw structuresError;
  const structures = (structuresData ?? []) as AcademicStructureRow[];
  const structureByCode = new Map(
    structures.map((structure) => [structure.code, structure]),
  );
  const structureIds = structures.map((structure) => structure.id);
  const { data: structureYearsData, error: structureYearsError } =
    structureIds.length
      ? await (allYears
          ? supabase
              .from("academic_structure_years")
              .select("*")
              .in("structure_id", structureIds)
          : supabase
              .from("academic_structure_years")
              .select("*")
              .eq("academic_year_id", selectedYear.id)
              .in("structure_id", structureIds))
      : { data: [], error: null };
  if (structureYearsError) throw structureYearsError;
  const structureYearKey = (structureId: number, academicYearId: number) =>
    `${structureId}:${academicYearId}`;
  const structureYearByKey = new Map(
    ((structureYearsData ?? []) as AcademicStructureYearRow[]).map(
      (structureYear) => [
        structureYearKey(
          structureYear.structure_id,
          structureYear.academic_year_id,
        ),
        structureYear,
      ],
    ),
  );

  const records = entries.map((entry) => {
    const latestTarget = latestTargetByEntryId.get(entry.id) ?? null;
    const latestRun = latestTarget
      ? (runById.get(latestTarget.run_id) ?? null)
      : null;
    const structure = structureByCode.get(entry.code) ?? null;
    const structureYear = structure
      ? (structureYearByKey.get(
          structureYearKey(structure.id, entry.academic_year_id),
        ) ?? null)
      : null;
    const latestImport =
      latestTarget && latestRun
        ? {
            runId: latestRun.id,
            runNumber: latestRun.run_number,
            targetId: latestTarget.id,
            processingStatus: latestTarget.processing_status,
            reviewStatus: latestTarget.review_status,
            changeKind: latestTarget.change_kind,
            errorSummary: latestTarget.error_summary,
            createdAt: latestTarget.created_at,
          }
        : null;
    const record: AcademicStructureDirectoryRecord = {
      id: entry.id,
      year: yearById.get(entry.academic_year_id) ?? selectedYear.year,
      kind: structureKind,
      code: entry.code,
      title: entry.title,
      shortTitle: entry.short_title,
      academicCareer: entry.academic_career,
      durationYears: entry.duration_years,
      units: entry.units,
      modeOfDelivery: entry.mode_of_delivery,
      selectionRank: entry.selection_rank,
      sourceUrl: entry.source_url,
      isAvailable: entry.is_available,
      firstSeenAt: entry.first_seen_at,
      lastSeenAt: entry.last_seen_at,
      structureId: structure?.id ?? null,
      structurePublicId: structureYear?.public_id ?? null,
      structureYearId: structureYear?.id ?? null,
      draftSnapshotId: structureYear?.draft_snapshot_id ?? null,
      publishedSnapshotId: structureYear?.published_snapshot_id ?? null,
      importStatus: "directory",
      latestImport,
    };
    record.importStatus = academicStructureDirectoryRecordStatus(record);
    return record;
  });
  const filteredRecords =
    status === "all"
      ? records
      : records.filter(
          (record) => (record.importStatus === status) !== statusNegated,
        );
  const sortedRecords = [...filteredRecords].sort((left, right) => {
    const selectedSort = sort ?? "code-asc";
    if (selectedSort === "status") {
      return left.importStatus.localeCompare(right.importStatus);
    }
    const field = selectedSort.startsWith("title") ? "title" : "code";
    const comparison = left[field].localeCompare(right[field], "en-AU", {
      sensitivity: "base",
    });
    return selectedSort.endsWith("desc") ? -comparison : comparison;
  });
  const start = (currentPage - 1) * currentPageSize;
  const activeRun = activeRunResult.data;

  return {
    kind: structureKind,
    year: selectedYear,
    allYears,
    years,
    records: sortedRecords.slice(start, start + currentPageSize),
    page: currentPage,
    pageSize: currentPageSize,
    total: filteredRecords.length,
    activeRun: activeRun
      ? {
          id: activeRun.id,
          runNumber: activeRun.run_number,
          status: activeRun.status,
          structureKind: activeRun.structure_kind as AcademicStructureKind,
          targetCount: activeRun.target_count,
          processedCount:
            activeRun.succeeded_count +
            activeRun.failed_count +
            activeRun.cancelled_count,
        }
      : null,
  };
}
