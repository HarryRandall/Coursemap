import type { Database, Json } from "@/types/database";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
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
import { loadCourseSnapshotProjection } from "@/lib/coursemap/admin-course-year";
import { COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE } from "@/lib/coursemap/course-import-query-shape";

export const COURSE_IMPORT_YEARS = Array.from(
  { length: 11 },
  (_, index) => 2020 + index,
);

export type CourseDirectoryStatus =
  | "all"
  | "directory"
  | "queued"
  | "processing"
  | "needs-review"
  | "draft"
  | "published"
  | "unchanged"
  | "failed";

export type CourseDirectorySort =
  "code-asc" | "code-desc" | "title-asc" | "title-desc" | "status";

export type AcademicYearOption = {
  id: number | null;
  year: number;
  importEnabled: boolean;
  sourceAvailability: "available" | "unavailable" | "unknown";
  availabilityCheckedAt: string | null;
  availabilityNote: string | null;
  directoryRefreshedAt: string | null;
};

export type CourseDirectoryRecord = {
  id: number;
  /** The academic year this directory entry belongs to. */
  year: number;
  code: string;
  title: string;
  units: number | null;
  academicCareer: string | null;
  session: string | null;
  modeOfDelivery: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
  courseId: number | null;
  coursePublicId: string | null;
  courseYearId: number | null;
  draftSnapshotId: number | null;
  publishedSnapshotId: number | null;
  latestImport: {
    runId: string;
    targetId: string;
    processingStatus: string;
    reviewStatus: string;
    changeKind: string | null;
    errorSummary: string | null;
    createdAt: string;
  } | null;
};

export type CourseDirectoryPage = {
  /**
   * The year the year-scoped controls act on. When allYears is true this is
   * only the fallback for a refresh or an import, not what the table shows.
   */
  year: AcademicYearOption;
  /** Every year is listed at once, so per-year actions are unavailable. */
  allYears: boolean;
  records: CourseDirectoryRecord[];
  page: number;
  pageSize: number;
  total: number;
  activeRun: {
    id: string;
    status: string;
    targetCount: number;
    processedCount: number;
  } | null;
};

export type CourseImportSummary = {
  id: string;
  courseCode: string;
  courseTitle: string;
  academicYear: number;
  processingStatus: string;
  reviewStatus: string;
  changeKind: string | null;
  errorSummary: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type CourseImportPage = {
  records: CourseImportSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type CourseImportArtifact = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
  byteSize: number;
  contentSha256: string;
  createdAt: string;
};

export type CourseImportReviewItem = {
  id: string;
  entityKind: string;
  entityKey: string;
  fieldPath: string;
  issueCode: string;
  importance: string;
  isBlocking: boolean;
  confidence: number | null;
  summary: string;
  oldValue: Json | null;
  newValue: Json | null;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
  status: string;
  resolutionNote: string | null;
};

export type CourseImportTargetDetail = {
  run: {
    id: string;
    runNumber: number;
    academicYear: number;
    status: string;
    requestedModel: string;
  };
  target: {
    id: string;
    courseCode: string;
    coursePublicId: string | null;
    processingStatus: string;
    reviewStatus: string;
    changeKind: string | null;
    attemptCount: number;
    baselineDraftSnapshotId: number | null;
    baselinePublishedSnapshotId: number | null;
    candidateSnapshotId: number | null;
    currentDraftSnapshotId: number | null;
    currentPublishedSnapshotId: number | null;
    errorCode: string | null;
    errorSummary: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  candidateSnapshot:
    Database["public"]["Tables"]["course_snapshots"]["Row"] | null;
  candidateProjection: CourseSnapshotProjectionData | null;
  previousSnapshot: {
    id: number;
    basis:
      | "draft_at_import_start"
      | "published_at_import_start"
      | "current_draft"
      | "current_published";
    label: string;
    projection: CourseSnapshotProjectionData;
  } | null;
  sourcePage: Database["public"]["Tables"]["course_source_pages"]["Row"] | null;
  stages: Array<Database["public"]["Tables"]["course_import_stages"]["Row"]>;
  artifacts: CourseImportArtifact[];
  extractions: Array<Database["public"]["Tables"]["course_extractions"]["Row"]>;
  reviewItems: CourseImportReviewItem[];
  relationalData: Record<string, unknown>;
};

type ImportTargetRow =
  Database["public"]["Tables"]["course_import_targets"]["Row"];
type AdminDirectoryEntryRow =
  Database["public"]["Views"]["course_directory_admin_entries"]["Row"];

function assertCompleteDirectoryEntry(
  entry: AdminDirectoryEntryRow,
): asserts entry is AdminDirectoryEntryRow & {
  id: number;
  code: string;
  title: string;
  first_seen_at: string;
  last_seen_at: string;
  is_current: boolean;
} {
  if (
    entry.id === null ||
    entry.code === null ||
    entry.title === null ||
    entry.first_seen_at === null ||
    entry.last_seen_at === null ||
    entry.is_current === null
  ) {
    throw new Error("The course directory view returned an incomplete row.");
  }
}

function safePage(value: number | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function safeSearch(value: string | undefined) {
  return (value ?? "")
    .trim()
    .slice(0, 120)
    .replace(/[^A-Za-z0-9 &-]/g, " ")
    .replace(/\s+/g, " ");
}

function normaliseAvailability(value: string) {
  return value === "available" || value === "unavailable" ? value : "unknown";
}

function defaultAcademicYear(year: number): AcademicYearOption {
  return {
    id: null,
    year,
    importEnabled: false,
    sourceAvailability: "unknown",
    availabilityCheckedAt: null,
    availabilityNote: null,
    directoryRefreshedAt: null,
  };
}

export async function loadAcademicYearOptions(): Promise<AcademicYearOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select(
      "id,year,is_import_enabled,source_availability,availability_checked_at,availability_note,directory_refreshed_at",
    )
    .gte("year", COURSE_IMPORT_YEARS[0]!)
    .lte("year", COURSE_IMPORT_YEARS.at(-1)!)
    .order("year", { ascending: false });
  if (error) throw error;

  const byYear = new Map((data ?? []).map((row) => [row.year, row]));
  return COURSE_IMPORT_YEARS.toReversed().map((year) => {
    const row = byYear.get(year);
    return row
      ? {
          id: row.id,
          year: row.year,
          importEnabled: row.is_import_enabled,
          sourceAvailability: normaliseAvailability(row.source_availability),
          availabilityCheckedAt: row.availability_checked_at,
          availabilityNote: row.availability_note,
          directoryRefreshedAt: row.directory_refreshed_at,
        }
      : defaultAcademicYear(year);
  });
}

export async function loadCourseDirectoryPage({
  year,
  page,
  query,
  sort = "code-asc",
  status = "all",
  statusNegated = false,
  pageSize = 50,
  academicYearOptions,
}: {
  year: number | "all";
  page?: number;
  query?: string;
  sort?: CourseDirectorySort;
  status?: CourseDirectoryStatus;
  /** Invert the status filter so the page reads "status is not <status>". */
  statusNegated?: boolean;
  pageSize?: number;
  academicYearOptions?: Promise<AcademicYearOption[]>;
}): Promise<CourseDirectoryPage> {
  const currentPage = safePage(page);
  const currentPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));
  const years = await (academicYearOptions ?? loadAcademicYearOptions());
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
      year: selectedYear,
      allYears,
      records: [],
      page: currentPage,
      pageSize: currentPageSize,
      total: 0,
      activeRun: null,
    };
  }

  const supabase = await createClient();
  const activeRunPromise = supabase
    .from("course_import_runs")
    .select("id,status,target_count,processed_count")
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
    .from("course_directory_admin_entries")
    .select("*", { count: "exact" })
    .eq("is_current", true);
  if (!allYears) {
    entriesQuery = entriesQuery.eq("academic_year_id", selectedYear.id);
  }
  const search = safeSearch(query);
  if (search) {
    entriesQuery = entriesQuery.or(
      `code.ilike.*${search}*,title.ilike.*${search}*`,
    );
  }
  if (status !== "all") {
    // A negated filter has to keep rows whose column is null: "is not draft"
    // includes every entry that was never imported, not just the imported
    // ones that failed to produce a draft.
    if (status === "directory") {
      entriesQuery = statusNegated
        ? entriesQuery.or(
            "latest_target_id.not.is.null,draft_snapshot_id.not.is.null,published_snapshot_id.not.is.null",
          )
        : entriesQuery
            .is("latest_target_id", null)
            .is("draft_snapshot_id", null)
            .is("published_snapshot_id", null);
    } else if (status === "draft") {
      entriesQuery = statusNegated
        ? entriesQuery.is("draft_snapshot_id", null)
        : entriesQuery.not("draft_snapshot_id", "is", null);
    } else if (status === "published") {
      entriesQuery = statusNegated
        ? entriesQuery.is("published_snapshot_id", null)
        : entriesQuery.not("published_snapshot_id", "is", null);
    } else if (status === "needs-review") {
      entriesQuery = statusNegated
        ? entriesQuery.or(
            "latest_review_status.is.null,latest_review_status.neq.pending",
          )
        : entriesQuery.eq("latest_review_status", "pending");
    } else {
      entriesQuery = statusNegated
        ? entriesQuery.or(
            `latest_processing_status.is.null,latest_processing_status.neq.${status}`,
          )
        : entriesQuery.eq("latest_processing_status", status);
    }
  }

  const start = (currentPage - 1) * currentPageSize;
  const orderField = sort.startsWith("title")
    ? "title"
    : sort === "status"
      ? "latest_processing_status"
      : "code";
  const ascending = !sort.endsWith("desc");
  // Listing every year interleaves duplicate codes, so the year breaks the
  // tie and keeps each code's rows together and newest-first.
  const orderedEntriesQuery = allYears
    ? entriesQuery
        .order(orderField, { ascending })
        .order("academic_year_id", { ascending: false })
    : entriesQuery.order(orderField, { ascending });
  const [entriesResult, activeRunResult] = await Promise.all([
    orderedEntriesQuery.range(start, start + currentPageSize - 1),
    activeRunPromise,
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (activeRunResult.error) throw activeRunResult.error;

  const entries = entriesResult.data ?? [];
  const yearIds = entries.flatMap((entry) =>
    entry.course_year_id === null ? [] : [entry.course_year_id],
  );
  const { data: workspaceYears, error: workspaceError } = yearIds.length
    ? await supabase
        .from("course_years")
        .select("id,public_id")
        .in("id", yearIds)
    : { data: [], error: null };
  if (workspaceError) throw workspaceError;
  const publicIdByYearId = new Map(
    (workspaceYears ?? []).map((item) => [item.id, item.public_id]),
  );

  return {
    year: selectedYear,
    allYears,
    page: currentPage,
    pageSize: currentPageSize,
    total: entriesResult.count ?? 0,
    activeRun: activeRunResult.data
      ? {
          id: activeRunResult.data.id,
          status: activeRunResult.data.status,
          targetCount: activeRunResult.data.target_count,
          processedCount: activeRunResult.data.processed_count,
        }
      : null,
    records: entries.map((entry) => {
      assertCompleteDirectoryEntry(entry);
      return {
        id: entry.id,
        code: entry.code,
        title: entry.title,
        units: entry.units,
        academicCareer: entry.academic_career,
        session: entry.session,
        modeOfDelivery: entry.mode_of_delivery,
        firstSeenAt: entry.first_seen_at,
        lastSeenAt: entry.last_seen_at,
        isCurrent: entry.is_current,
        year:
          entry.academic_year_id === null
            ? selectedYear.year
            : (yearById.get(entry.academic_year_id) ?? selectedYear.year),
        courseId: entry.course_id,
        coursePublicId:
          entry.course_year_id === null
            ? null
            : (publicIdByYearId.get(entry.course_year_id) ?? null),
        courseYearId: entry.course_year_id,
        draftSnapshotId: entry.draft_snapshot_id,
        publishedSnapshotId: entry.published_snapshot_id,
        latestImport: entry.latest_target_id
          ? {
              runId: entry.latest_run_id!,
              targetId: entry.latest_target_id,
              processingStatus: entry.latest_processing_status!,
              reviewStatus: entry.latest_review_status!,
              changeKind: entry.latest_change_kind,
              errorSummary: entry.latest_error_summary,
              createdAt: entry.latest_created_at!,
            }
          : null,
      };
    }),
  };
}

/**
 * Imports are listed one course at a time. The run that batched them is an
 * implementation detail of the worker, not something an editor navigates.
 */
export async function loadCourseImportPage({
  page,
  pageSize = 25,
  query,
  sort = DEFAULT_IMPORT_LIST_SORT,
  status = "all",
  statusNegated = false,
}: {
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: ImportListSort;
  status?: ImportListStatus;
  statusNegated?: boolean;
} = {}): Promise<CourseImportPage> {
  const currentPage = safePage(page);
  const currentPageSize = Math.min(100, Math.max(10, Math.floor(pageSize)));

  const supabase = await createClient();
  const start = (currentPage - 1) * currentPageSize;
  const search = safeImportSearch(query);

  // Titles live on the directory entry, so a search resolves to entry ids
  // first and the target list is narrowed to them.
  let entryIds: number[] | null = null;
  if (search) {
    const { data: matches, error: matchError } = await supabase
      .from("course_directory_entries")
      .select("id")
      .or(`code.ilike.*${search}*,title.ilike.*${search}*`)
      .limit(MAX_SEARCH_ENTRY_IDS);
    if (matchError) throw matchError;
    entryIds = (matches ?? []).map((row) => row.id);
    if (entryIds.length === 0) {
      return {
        records: [],
        page: currentPage,
        pageSize: currentPageSize,
        total: 0,
      };
    }
  }

  let targetsQuery = supabase
    .from("course_import_targets")
    .select("*", { count: "exact" });
  if (entryIds) targetsQuery = targetsQuery.in("directory_entry_id", entryIds);
  const statusFilter = importStatusFilter("course", status);
  if (statusFilter) {
    targetsQuery = statusNegated
      ? targetsQuery.not(
          statusFilter.column,
          "in",
          `(${statusFilter.values.join(",")})`,
        )
      : targetsQuery.in(statusFilter.column, statusFilter.values);
  }
  const order = importSortOrder(sort, "course_code");
  const { data, count, error } = await targetsQuery
    .order(order.column, { ascending: order.ascending })
    .range(start, start + currentPageSize - 1);
  if (error) throw error;
  const targets = (data ?? []) as ImportTargetRow[];
  if (targets.length === 0) {
    return {
      records: [],
      page: currentPage,
      pageSize: currentPageSize,
      total: count ?? 0,
    };
  }

  const [yearsResult, entriesResult] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .in("id", [...new Set(targets.map((target) => target.academic_year_id))]),
    supabase
      .from("course_directory_entries")
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
      courseCode: target.course_code,
      courseTitle: titleById.get(target.directory_entry_id) ?? "",
      academicYear: yearById.get(target.academic_year_id) ?? 0,
      processingStatus: target.processing_status,
      reviewStatus: target.review_status,
      changeKind: target.change_kind,
      errorSummary: target.error_summary,
      createdAt: target.created_at,
      finishedAt: target.finished_at,
    })),
    page: currentPage,
    pageSize: currentPageSize,
    total: count ?? 0,
  };
}

async function snapshotRelationalData(
  snapshotId: number,
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const [
    fees,
    areas,
    related,
    attributes,
    unitOptions,
    offerings,
    learningOutcomes,
    assessments,
    rules,
    evidence,
  ] = await Promise.all([
    supabase
      .from("course_fees")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_areas_of_interest")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_related_courses")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_attributes")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_unit_options")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_offerings")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order(COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE.offeringOrder),
    supabase
      .from("course_learning_outcomes")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_assessment_items")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order("position"),
    supabase
      .from("course_rules")
      .select("*")
      .eq("course_snapshot_id", snapshotId),
    supabase
      .from("course_snapshot_field_evidence")
      .select("*")
      .eq("course_snapshot_id", snapshotId)
      .order(COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE.fieldEvidenceOrder),
  ]);
  const results = [
    fees,
    areas,
    related,
    attributes,
    unitOptions,
    offerings,
    learningOutcomes,
    assessments,
    rules,
    evidence,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const offeringIds = (offerings.data ?? []).map((row) => row.id);
  const assessmentIds = (assessments.data ?? []).map((row) => row.id);
  const ruleIds = (rules.data ?? []).map((row) => row.id);
  const [sessions, assessmentOutcomes, groups, conditions, references] =
    await Promise.all([
      offeringIds.length
        ? supabase
            .from("offering_sessions")
            .select("*")
            .in("course_offering_id", offeringIds)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
      assessmentIds.length
        ? supabase
            .from("course_assessment_outcomes")
            .select("*")
            .in("assessment_item_id", assessmentIds)
        : Promise.resolve({ data: [], error: null }),
      ruleIds.length
        ? supabase
            .from("course_rule_groups")
            .select("*")
            .in("course_rule_id", ruleIds)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
      ruleIds.length
        ? supabase
            .from("course_rule_conditions")
            .select("*")
            .in("course_rule_id", ruleIds)
            .order("position")
        : Promise.resolve({ data: [], error: null }),
      ruleIds.length
        ? supabase
            .from("course_rule_course_references")
            .select("*")
            .in("course_rule_id", ruleIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const childResults = [
    sessions,
    assessmentOutcomes,
    groups,
    conditions,
    references,
  ];
  const childFailed = childResults.find((result) => result.error);
  if (childFailed?.error) throw childFailed.error;

  const conditionIds = (conditions.data ?? []).map((row) => row.id);
  const conditionCourses = conditionIds.length
    ? await supabase
        .from("course_rule_condition_courses")
        .select("*")
        .in(
          COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE.conditionCoursesForeignKey,
          conditionIds,
        )
        .order("position")
    : { data: [], error: null };
  if (conditionCourses.error) throw conditionCourses.error;

  return {
    fees: fees.data ?? [],
    areasOfInterest: areas.data ?? [],
    relatedCourses: related.data ?? [],
    attributes: attributes.data ?? [],
    unitOptions: unitOptions.data ?? [],
    offerings: offerings.data ?? [],
    offeringSessions: sessions.data ?? [],
    learningOutcomes: learningOutcomes.data ?? [],
    assessmentItems: assessments.data ?? [],
    assessmentOutcomes: assessmentOutcomes.data ?? [],
    rules: rules.data ?? [],
    ruleGroups: groups.data ?? [],
    ruleConditions: conditions.data ?? [],
    ruleConditionCourses: conditionCourses.data ?? [],
    ruleCourseReferences: references.data ?? [],
    fieldEvidence: evidence.data ?? [],
  };
}

/** Target ids are unique, so the review page addresses one without its run. */
export async function loadCourseImportTargetDetail({
  targetId,
  includeProjections = true,
}: {
  targetId: string;
  includeProjections?: boolean;
}): Promise<CourseImportTargetDetail | null> {
  const supabase = await createClient();
  const { data: targetData, error: targetError } = await supabase
    .from("course_import_targets")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetData) return null;
  const target = targetData as ImportTargetRow;
  const runId = target.run_id;

  const [
    runResult,
    yearResult,
    stagesResult,
    artifactsResult,
    extractionsResult,
    reviewResult,
  ] = await Promise.all([
    supabase
      .from("course_import_runs")
      .select("id,run_number,status,requested_model")
      .eq("id", runId)
      .single(),
    supabase
      .from("academic_years")
      .select("year")
      .eq("id", target.academic_year_id)
      .single(),
    supabase
      .from("course_import_stages")
      .select("*")
      .eq("target_id", targetId)
      .order("position"),
    supabase
      .from("course_import_artifacts")
      .select("*")
      .eq("target_id", targetId)
      .order("attempt_number", { ascending: false }),
    supabase
      .from("course_extractions")
      .select("*")
      .eq("target_id", targetId)
      .order("extraction_number", { ascending: false }),
    supabase
      .from("course_review_items")
      .select("*")
      .eq("target_id", targetId)
      .order("created_at"),
  ]);
  const requiredResults = [
    runResult,
    yearResult,
    stagesResult,
    artifactsResult,
    extractionsResult,
    reviewResult,
  ];
  const failed = requiredResults.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const [snapshotResult, courseYearResult, sourceResult, courseResult] =
    await Promise.all([
      target.candidate_snapshot_id === null
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("course_snapshots")
            .select("*")
            .eq("id", target.candidate_snapshot_id)
            .single(),
      target.course_year_id === null
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("course_years")
            .select("public_id,draft_snapshot_id,published_snapshot_id")
            .eq("id", target.course_year_id)
            .single(),
      target.source_page_id === null
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("course_source_pages")
            .select("*")
            .eq("id", target.source_page_id)
            .single(),
      target.course_id === null
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("courses")
            .select("public_id")
            .eq("id", target.course_id)
            .single(),
    ]);
  const secondaryResults = [
    snapshotResult,
    courseYearResult,
    sourceResult,
    courseResult,
  ];
  const secondaryFailed = secondaryResults.find((result) => result.error);
  if (secondaryFailed?.error) throw secondaryFailed.error;

  const currentDraftSnapshotId =
    courseYearResult.data?.draft_snapshot_id ?? null;
  const currentPublishedSnapshotId =
    courseYearResult.data?.published_snapshot_id ?? null;
  const previousSnapshotChoice = [
    {
      id: target.baseline_draft_snapshot_id,
      basis: "draft_at_import_start" as const,
      label: "Draft when this import started",
      isBaseline: true,
    },
    {
      id: target.baseline_published_snapshot_id,
      basis: "published_at_import_start" as const,
      label: "Published snapshot when this import started",
      isBaseline: true,
    },
    {
      id: currentDraftSnapshotId,
      basis: "current_draft" as const,
      label: "Current draft",
      isBaseline: false,
    },
    {
      id: currentPublishedSnapshotId,
      basis: "current_published" as const,
      label: "Current published snapshot",
      isBaseline: false,
    },
  ].find(
    (choice): choice is typeof choice & { id: number } =>
      choice.id !== null &&
      (choice.isBaseline || choice.id !== target.candidate_snapshot_id),
  );
  const previousSnapshotResult =
    includeProjections && previousSnapshotChoice
      ? previousSnapshotChoice.id === target.candidate_snapshot_id
        ? snapshotResult
        : await supabase
            .from("course_snapshots")
            .select("*")
            .eq("id", previousSnapshotChoice.id)
            .single()
      : { data: null, error: null };
  if (previousSnapshotResult.error) throw previousSnapshotResult.error;

  const candidateProjectionPromise =
    includeProjections && snapshotResult.data
      ? loadCourseSnapshotProjection(
          snapshotResult.data,
          target.course_code,
          yearResult.data!.year,
        )
      : Promise.resolve(null);
  const previousProjectionPromise = previousSnapshotResult.data
    ? previousSnapshotChoice?.id === target.candidate_snapshot_id
      ? candidateProjectionPromise
      : loadCourseSnapshotProjection(
          previousSnapshotResult.data,
          target.course_code,
          yearResult.data!.year,
        )
    : Promise.resolve(null);

  const [relationalData, candidateProjection, previousProjection] =
    await Promise.all([
      includeProjections && target.candidate_snapshot_id
        ? snapshotRelationalData(target.candidate_snapshot_id)
        : Promise.resolve({}),
      candidateProjectionPromise,
      previousProjectionPromise,
    ]);

  return {
    run: {
      id: runResult.data!.id,
      runNumber: runResult.data!.run_number,
      academicYear: yearResult.data!.year,
      status: runResult.data!.status,
      requestedModel: runResult.data!.requested_model,
    },
    target: {
      id: target.id,
      courseCode: target.course_code,
      coursePublicId: courseYearResult.data?.public_id ?? null,
      processingStatus: target.processing_status,
      reviewStatus: target.review_status,
      changeKind: target.change_kind,
      attemptCount: target.attempt_count,
      baselineDraftSnapshotId: target.baseline_draft_snapshot_id,
      baselinePublishedSnapshotId: target.baseline_published_snapshot_id,
      candidateSnapshotId: target.candidate_snapshot_id,
      currentDraftSnapshotId,
      currentPublishedSnapshotId,
      errorCode: target.error_code,
      errorSummary: target.error_summary,
      createdAt: target.created_at,
      finishedAt: target.finished_at,
    },
    candidateSnapshot: snapshotResult.data,
    candidateProjection,
    previousSnapshot:
      previousSnapshotChoice && previousProjection
        ? {
            id: previousSnapshotChoice.id,
            basis: previousSnapshotChoice.basis,
            label: previousSnapshotChoice.label,
            projection: previousProjection,
          }
        : null,
    sourcePage: sourceResult.data,
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
    extractions: extractionsResult.data ?? [],
    reviewItems: (reviewResult.data ?? []).map((item) => ({
      id: item.id,
      entityKind: item.entity_kind,
      entityKey: item.entity_key,
      fieldPath: item.field_path,
      issueCode: item.issue_code,
      importance: item.importance,
      isBlocking: item.is_blocking,
      confidence: item.confidence,
      summary: item.summary,
      oldValue: item.old_value,
      newValue: item.new_value,
      sourceLocator: item.source_locator,
      sourceExcerpt: item.source_excerpt,
      status: item.status,
      resolutionNote: item.resolution_note,
    })),
    relationalData,
  };
}
