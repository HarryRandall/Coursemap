import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  type AdminCatalogueSummary,
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryPage,
  type CatalogueDirectoryRecord,
  type CatalogueKind,
  DEFAULT_IMPORT_RECORD_SORT,
  type DirectoryFilter,
  type DirectoryWorkflowStatus,
  type ImportRecordSort,
  type ImportRecordsPage,
  type ImportRunProgress,
  type ImportRunRow,
  type ImportTargetDetail,
} from "./catalogue-kinds";

export * from "./catalogue-kinds";

const PAGE_SIZE = 50;

function workflowFor(input: {
  hasDraft: boolean;
  isPublished: boolean;
  latestStatus: string | null;
}): DirectoryWorkflowStatus {
  if (input.latestStatus === "queued") return "queued";
  if (input.latestStatus === "running") return "running";
  if (input.latestStatus === "failed" && !input.isPublished && !input.hasDraft)
    return "failed";
  if (input.isPublished && input.hasDraft) return "published_with_draft";
  if (input.isPublished) return "published";
  if (input.latestStatus === "ready") return "ready";
  if (input.hasDraft) return "draft";
  if (input.latestStatus === "failed") return "failed";
  return "not_imported";
}

function emptyCounts(): Record<DirectoryWorkflowStatus, number> {
  return {
    not_imported: 0,
    queued: 0,
    running: 0,
    ready: 0,
    draft: 0,
    published: 0,
    published_with_draft: 0,
    failed: 0,
  };
}

/**
 * The years an administrator can choose. Every seeded academic year from 2020
 * to 2030 used to be offered, so the picker listed eleven years of which only
 * one held any catalogue, tall enough to cover the page tabs when it opened.
 * It now offers the years whose listing has been fetched, plus this year and
 * next so the coming handbook can always be imported before it has any rows.
 * The fetched years come from the directory statuses, one row per year and
 * kind, rather than from the entries themselves, which run to thousands.
 */
export async function loadCatalogueYears() {
  const supabase = await createClient();
  const [yearsResult, statusesResult] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,year")
      .gte("year", 2020)
      .lte("year", 2030),
    supabase.from("catalogue_discovery_statuses").select("academic_year_id"),
  ]);
  if (yearsResult.error) throw yearsResult.error;
  if (statusesResult.error) throw statusesResult.error;
  const current = new Date().getFullYear();
  const fetched = new Set(
    (statusesResult.data ?? []).map((row) => row.academic_year_id),
  );
  return (yearsResult.data ?? [])
    .filter(
      (row) =>
        fetched.has(row.id) || row.year === current || row.year === current + 1,
    )
    .map((row) => row.year)
    .sort((left, right) => right - left);
}

/**
 * The year an administrator most likely wants: the newest with catalogue
 * content for the kind, else the current calendar year, else the newest.
 */
export async function defaultCatalogueYear(
  kind: CatalogueKind,
  years: number[],
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogue_records")
    .select("academic_years(year)")
    .eq("kind", kind)
    .order("academic_year_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const withContent = data?.academic_years?.year;
  if (withContent && years.includes(withContent)) return withContent;
  const current = new Date().getFullYear();
  if (years.includes(current)) return current;
  return years[0] ?? current;
}

const ROW_PAGE_SIZE = 1000;

/**
 * PostgREST answers every request with at most 1,000 rows, whatever the query
 * asks for, and does so without saying anything. The directory reads a whole
 * year's listing to filter it in memory, so one request stopped at the
 * thousandth code: everything after EMET1001, about two thirds of the course
 * catalogue, could not be found, filtered or imported from the directory, and
 * the footer reported a total of exactly 1,000. This reads every page. Each
 * caller must order by a unique key so a row cannot move between pages.
 */
async function readAllRows<Row>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>,
): Promise<{ data: Row[]; error: PostgrestError | null }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + ROW_PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < ROW_PAGE_SIZE) return { data: rows, error: null };
  }
}

/**
 * Directory entries for one kind and year with each record's workflow state.
 * Filtering by workflow happens in memory because the state derives from
 * three tables; a directory holds a few thousand rows at most.
 */
export async function loadCatalogueDirectoryPage({
  kind,
  academicYear,
  query = "",
  filter = "all",
  page = 1,
}: {
  kind: CatalogueKind;
  academicYear: number;
  query?: string;
  filter?: DirectoryFilter;
  page?: number;
}): Promise<CatalogueDirectoryPage> {
  const supabase = await createClient();
  const years = await loadCatalogueYears();
  const { data: yearRow } = await supabase
    .from("academic_years")
    .select("id")
    .eq("year", academicYear)
    .maybeSingle();
  const empty: CatalogueDirectoryPage = {
    kind,
    academicYear,
    years,
    status: { state: "never", refreshedAt: null, message: null, entryCount: 0 },
    records: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    workflowCounts: emptyCounts(),
  };
  if (!yearRow) return empty;

  const [statusResult, entriesResult, itemYearsResult, targetsResult] =
    await Promise.all([
      supabase
        .from("catalogue_discovery_statuses")
        .select("status,refreshed_at,message,entry_count")
        .eq("academic_year_id", yearRow.id)
        .eq("kind", kind)
        .maybeSingle(),
      // Codes are unique within a kind and year, so code alone orders the pages.
      readAllRows((from, to) =>
        supabase
          .from("catalogue_listings")
          .select("code,title,summary,code_id,is_current,last_seen_at")
          .eq("academic_year_id", yearRow.id)
          .eq("kind", kind)
          .order("code")
          .range(from, to),
      ),
      readAllRows((from, to) =>
        supabase
          .from("catalogue_records")
          .select("code_id,public_id,published_version_id,archived_at")
          .eq("academic_year_id", yearRow.id)
          .eq("kind", kind)
          .order("code_id")
          .range(from, to),
      ),
      // Newest first so the first target seen per item is its latest; id breaks
      // ties between targets created in the same instant.
      readAllRows((from, to) =>
        supabase
          .from("catalogue_import_targets")
          .select(
            "id,run_id,code_id,status,change_kind,error_message,completed_at,created_at,applied_version_id",
          )
          .eq("academic_year_id", yearRow.id)
          .eq("kind", kind)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    ]);
  if (statusResult.error) throw statusResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (itemYearsResult.error) throw itemYearsResult.error;
  if (targetsResult.error) throw targetsResult.error;

  const itemYearByItem = new Map(
    (itemYearsResult.data ?? []).map((row) => [row.code_id, row]),
  );
  const latestTargetByItem = new Map<
    number,
    (typeof targetsResult.data)[number]
  >();
  for (const target of targetsResult.data ?? []) {
    if (!latestTargetByItem.has(target.code_id)) {
      latestTargetByItem.set(target.code_id, target);
    }
  }

  // Items imported directly (without a directory row) still appear so the
  // administrator can see everything the year holds.
  const entryCodes = new Set(entriesResult.data.map((row) => row.code));
  const entryItemIds = new Set(entriesResult.data.map((row) => row.code_id));
  const extraItemIds = [...itemYearByItem.keys()].filter(
    (itemId) => !entryItemIds.has(itemId),
  );
  const { data: extraItems } = extraItemIds.length
    ? await supabase
        .from("catalogue_codes")
        .select("id,code")
        .in("id", extraItemIds)
    : { data: [] as Array<{ id: number; code: string }> };

  const allRecords: CatalogueDirectoryRecord[] = [
    ...(entriesResult.data ?? []).map((entry) => ({
      code: entry.code,
      title: entry.title,
      summary: (entry.summary ?? {}) as Record<string, unknown>,
      itemId: entry.code_id,
      isListedByAnu: entry.is_current,
      lastSeenAt: entry.last_seen_at,
    })),
    ...(extraItems ?? [])
      .filter((item) => !entryCodes.has(item.code))
      .map((item) => ({
        code: item.code,
        title: null,
        summary: {},
        itemId: item.id,
        isListedByAnu: null,
        lastSeenAt: null,
      })),
  ]
    .map(({ code, title, summary, itemId, isListedByAnu, lastSeenAt }) => {
      const itemYear = itemId === null ? undefined : itemYearByItem.get(itemId);
      const latest =
        itemId === null ? undefined : latestTargetByItem.get(itemId);
      const hasDraft = Boolean(
        latest?.applied_version_id &&
        latest.applied_version_id !== itemYear?.published_version_id,
      );
      const isPublished =
        Boolean(itemYear?.published_version_id) && !itemYear?.archived_at;
      return {
        code,
        title,
        summary,
        recordPublicId: itemYear?.public_id ?? null,
        hasDraft,
        isPublished,
        isListedByAnu,
        lastSeenAt,
        workflow: workflowFor({
          hasDraft,
          isPublished,
          latestStatus: latest?.status ?? null,
        }),
        latestTarget: latest
          ? {
              id: latest.id,
              runId: latest.run_id,
              status: latest.status,
              changeKind: latest.change_kind,
              errorMessage: latest.error_message,
              completedAt: latest.completed_at,
            }
          : null,
      } satisfies CatalogueDirectoryRecord;
    })
    .sort((left, right) => left.code.localeCompare(right.code));

  const workflowCounts = emptyCounts();
  for (const record of allRecords) workflowCounts[record.workflow] += 1;

  const needle = query.trim().toUpperCase();
  // Code prefix matches come first, then other code matches, then titles.
  const rank = (record: CatalogueDirectoryRecord) =>
    !needle
      ? 0
      : record.code.startsWith(needle)
        ? 0
        : record.code.includes(needle)
          ? 1
          : 2;
  const filtered = allRecords
    .filter(
      (record) =>
        (filter === "all" || record.workflow === filter) &&
        (!needle ||
          record.code.includes(needle) ||
          (record.title ?? "").toUpperCase().includes(needle)),
    )
    .sort(
      (left, right) =>
        rank(left) - rank(right) || left.code.localeCompare(right.code),
    );
  const safePage = Math.max(
    1,
    Math.min(page, Math.ceil(filtered.length / PAGE_SIZE) || 1),
  );
  const start = (safePage - 1) * PAGE_SIZE;

  return {
    kind,
    academicYear,
    years,
    status: {
      state:
        (statusResult.data
          ?.status as CatalogueDirectoryPage["status"]["state"]) ?? "never",
      refreshedAt: statusResult.data?.refreshed_at ?? null,
      message: statusResult.data?.message ?? null,
      entryCount: statusResult.data?.entry_count ?? 0,
    },
    records: filtered.slice(start, start + PAGE_SIZE),
    total: filtered.length,
    page: safePage,
    pageSize: PAGE_SIZE,
    workflowCounts,
  };
}

const IMPORT_RECORD_PAGE_SIZE = 25;
const RECENT_RUN_LIMIT = 20;

const RUN_COLUMNS =
  "id,run_number,kind,status,requested_model,target_count,completed_count,failed_count,cost_usd,created_at,completed_at,academic_years(year)";

type RunRow = {
  id: string;
  run_number: number;
  kind: string;
  status: string;
  requested_model: string;
  target_count: number;
  completed_count: number;
  failed_count: number;
  cost_usd: number | string;
  created_at: string;
  completed_at: string | null;
  academic_years: { year: number } | null;
};

function runRow(run: RunRow): ImportRunRow {
  return {
    id: run.id,
    runNumber: run.run_number,
    kind: run.kind as CatalogueKind,
    academicYear: run.academic_years?.year ?? 0,
    status: run.status,
    requestedModel: run.requested_model,
    targetCount: run.target_count,
    completedCount: run.completed_count,
    failedCount: run.failed_count,
    costUsd: Number(run.cost_usd),
    createdAt: run.created_at,
    completedAt: run.completed_at,
  };
}

// The year is taken from the target's own column and resolved through the
// academic year table, rather than reached by a nested embed through the run:
// PostgREST resolves `catalogue_import_targets -> catalogue_records` by two
// foreign keys of the same name, so the embedded shape is not typed.
const RECORD_COLUMNS =
  "id,code,academic_year_id,status,change_kind,attempt_count,error_code,error_message,applied_version_id,created_at,completed_at,run_id,directory_entry_id,record_id";

type RecordRow = {
  id: string;
  code: string;
  academic_year_id: number;
  status: string;
  change_kind: string | null;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  applied_version_id: number | null;
  created_at: string;
  completed_at: string | null;
  run_id: string;
  directory_entry_id: number | null;
  record_id: number;
};

/**
 * A PostgREST `or` list is comma separated and parenthesised, so a needle
 * carrying either character would change the shape of the filter rather than
 * be matched by it.
 */
function safeNeedle(query: string) {
  return query
    .trim()
    .replace(/[(),*]/g, " ")
    .trim();
}

/**
 * One page of imported records for a kind: a flat history across every run,
 * narrowed by a search over code and title, by the record's own outcome and
 * by the run that produced it. The run travels on each row, so a reader never
 * has to pick a batch before seeing what was imported.
 *
 * The recent runs come back with the page because they are the run filter's
 * options and, when one is chosen, the strip that carries its progress and
 * its Stop control.
 */
export async function loadCatalogueImportRecords({
  kind,
  query = "",
  status = "",
  runId = null,
  sort = DEFAULT_IMPORT_RECORD_SORT,
  page = 1,
}: {
  kind: CatalogueKind;
  query?: string;
  status?: string;
  runId?: string | null;
  sort?: ImportRecordSort;
  page?: number;
}): Promise<ImportRecordsPage> {
  const supabase = await createClient();
  const needle = safeNeedle(query);

  const { data: runData, error: runError } = await supabase
    .from("catalogue_import_runs")
    .select(RUN_COLUMNS)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(RECENT_RUN_LIMIT);
  if (runError) throw runError;
  const runs = ((runData ?? []) as RunRow[]).map(runRow);

  // A run chosen from an older page is not in the recent list, so it is read
  // on its own rather than silently dropping the filter the reader applied.
  let run = runs.find((candidate) => candidate.id === runId) ?? null;
  if (runId && !run) {
    const { data: single } = await supabase
      .from("catalogue_import_runs")
      .select(RUN_COLUMNS)
      .eq("id", runId)
      .eq("kind", kind)
      .maybeSingle();
    run = single ? runRow(single as RunRow) : null;
  }

  const empty: ImportRecordsPage = {
    records: [],
    page: 1,
    pageSize: IMPORT_RECORD_PAGE_SIZE,
    total: 0,
    sort,
    runs,
    run,
  };

  let recordsQuery = supabase
    .from("catalogue_import_targets")
    .select(RECORD_COLUMNS, { count: "exact" })
    .eq("kind", kind);
  if (status) recordsQuery = recordsQuery.eq("status", status);
  if (runId) {
    // An unknown run id would otherwise return every record, which reads as
    // though the filter had been ignored.
    if (!run) return empty;
    recordsQuery = recordsQuery.eq("run_id", runId);
  }

  if (needle) {
    // The title lives on the directory entry, which PostgREST cannot reach
    // from inside an `or`, so matching titles are resolved to entry ids first.
    const { data: titleMatches, error: titleError } = await supabase
      .from("catalogue_listings")
      .select("id")
      .eq("kind", kind)
      .ilike("title", `%${needle}%`)
      .limit(1000);
    if (titleError) throw titleError;
    const clauses = [`code.ilike.*${needle}*`];
    const entryIds = (titleMatches ?? []).map((match) => match.id);
    if (entryIds.length)
      clauses.push(`directory_entry_id.in.(${entryIds.join(",")})`);
    recordsQuery = recordsQuery.or(clauses.join(","));
  }

  recordsQuery =
    sort === "oldest"
      ? recordsQuery.order("created_at", { ascending: true })
      : sort === "code-asc"
        ? recordsQuery.order("code", { ascending: true })
        : sort === "code-desc"
          ? recordsQuery.order("code", { ascending: false })
          : recordsQuery.order("created_at", { ascending: false });
  // Ties on code or on a shared run timestamp would otherwise order
  // differently per page, so rows could repeat or go missing across pages.
  recordsQuery = recordsQuery.order("id", { ascending: true });

  const { count, error: countError } = await recordsQuery.range(0, 0);
  if (countError) throw countError;
  const total = count ?? 0;
  const safePage = Math.max(
    1,
    Math.min(page, Math.ceil(total / IMPORT_RECORD_PAGE_SIZE) || 1),
  );
  const from = (safePage - 1) * IMPORT_RECORD_PAGE_SIZE;
  const { data, error } = await recordsQuery.range(
    from,
    from + IMPORT_RECORD_PAGE_SIZE - 1,
  );
  if (error) throw error;
  const rows = (data ?? []) as RecordRow[];

  // The labels a row needs are resolved by id over the page rather than by
  // embedding them in the select above. One page is twenty-five rows, so this
  // is four small reads, and it keeps the ambiguous embeds out: PostgREST
  // reaches `catalogue_records` from a target through two foreign keys of
  // the same name, which it will not resolve and cannot type.
  const distinct = <Value>(values: Value[]) => [...new Set(values)];
  const entryIds = distinct(
    rows.map((row) => row.directory_entry_id).filter((id) => id !== null),
  );
  const yearIds = distinct(rows.map((row) => row.academic_year_id));
  const recordIds = distinct(rows.map((row) => row.record_id));
  // The recent runs are already loaded, so only a row from an older run than
  // the list offers costs a read.
  const olderRunIds = distinct(rows.map((row) => row.run_id)).filter(
    (id) => !runs.some((candidate) => candidate.id === id),
  );

  const [entries, years, itemYears, olderRuns] = await Promise.all([
    entryIds.length
      ? supabase
          .from("catalogue_listings")
          .select("id,title")
          .in("id", entryIds)
      : null,
    yearIds.length
      ? supabase.from("academic_years").select("id,year").in("id", yearIds)
      : null,
    recordIds.length
      ? supabase
          .from("catalogue_records")
          .select("id,public_id")
          .in("id", recordIds)
      : null,
    olderRunIds.length
      ? supabase
          .from("catalogue_import_runs")
          .select("id,run_number")
          .in("id", olderRunIds)
      : null,
  ]);
  if (entries?.error) throw entries.error;
  if (years?.error) throw years.error;
  if (itemYears?.error) throw itemYears.error;
  if (olderRuns?.error) throw olderRuns.error;

  const titleById = new Map(
    (entries?.data ?? []).map((entry) => [entry.id, entry.title]),
  );
  const yearById = new Map(
    (years?.data ?? []).map((year) => [year.id, year.year]),
  );
  const publicIdById = new Map(
    (itemYears?.data ?? []).map((itemYear) => [
      itemYear.id,
      itemYear.public_id,
    ]),
  );
  const runNumberById = new Map(runs.map((row) => [row.id, row.runNumber]));
  for (const row of olderRuns?.data ?? [])
    runNumberById.set(row.id, row.run_number);

  return {
    records: rows.map((row) => ({
      id: row.id,
      code: row.code,
      title:
        row.directory_entry_id === null
          ? null
          : (titleById.get(row.directory_entry_id) ?? null),
      academicYear: yearById.get(row.academic_year_id) ?? 0,
      status: row.status,
      changeKind: row.change_kind,
      attemptCount: row.attempt_count,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      appliedVersionId: row.applied_version_id,
      recordPublicId: publicIdById.get(row.record_id) ?? null,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      runId: row.run_id,
      runNumber: runNumberById.get(row.run_id) ?? 0,
    })),
    page: safePage,
    pageSize: IMPORT_RECORD_PAGE_SIZE,
    total,
    sort,
    runs,
    run,
  };
}

/**
 * The counters of one run and nothing else. An active run is watched through
 * this rather than by refetching the page, which previously reread every run
 * and every target every four seconds to learn that one number had moved.
 */
export async function loadImportRunProgress(
  runId: string,
): Promise<ImportRunProgress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_import_runs")
    .select("status,target_count,completed_count,failed_count")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status,
    targetCount: data.target_count,
    completedCount: data.completed_count,
    failedCount: data.failed_count,
  };
}

export async function loadImportTargetDetail(
  targetId: string,
): Promise<ImportTargetDetail | null> {
  const supabase = await createClient();
  const { data: target, error } = await supabase
    .from("catalogue_import_targets")
    .select("id,code,kind,status,attempt_count,error_code,error_message")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw error;
  if (!target) return null;
  const [stages, artifacts, extraction] = await Promise.all([
    supabase
      .from("catalogue_import_stages")
      .select(
        "id,stage_name,attempt_number,status,started_at,completed_at,error_code,error_summary",
      )
      .eq("target_id", targetId)
      .order("attempt_number")
      .order("started_at"),
    supabase
      .from("catalogue_import_artifacts")
      .select("id,stage_id,kind,attempt_number,media_type,byte_size")
      .eq("target_id", targetId)
      .order("created_at"),
    supabase
      .from("catalogue_extractions")
      .select(
        "resolved_model,finish_reason,validation_status,input_tokens,output_tokens,cost_usd,latency_ms,warning_count,error_count,error_summary",
      )
      .eq("target_id", targetId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (stages.error) throw stages.error;
  if (artifacts.error) throw artifacts.error;
  if (extraction.error) throw extraction.error;
  return {
    id: target.id,
    code: target.code,
    kind: target.kind as CatalogueKind,
    status: target.status,
    attemptCount: target.attempt_count,
    errorCode: target.error_code,
    errorMessage: target.error_message,
    stages: (stages.data ?? []).map((stage) => ({
      id: stage.id,
      name: stage.stage_name,
      attemptNumber: stage.attempt_number,
      status: stage.status,
      startedAt: stage.started_at,
      completedAt: stage.completed_at,
      errorCode: stage.error_code,
      errorSummary: stage.error_summary,
    })),
    artifacts: (artifacts.data ?? []).map((artifact) => ({
      id: artifact.id,
      stageId: artifact.stage_id,
      kind: artifact.kind,
      attemptNumber: artifact.attempt_number,
      mediaType: artifact.media_type,
      byteSize: artifact.byte_size,
    })),
    extraction: extraction.data
      ? {
          resolvedModel: extraction.data.resolved_model,
          finishReason: extraction.data.finish_reason,
          validationStatus: extraction.data.validation_status,
          inputTokens: extraction.data.input_tokens,
          outputTokens: extraction.data.output_tokens,
          costUsd: Number(extraction.data.cost_usd),
          latencyMs: extraction.data.latency_ms,
          warningCount: extraction.data.warning_count,
          errorCount: extraction.data.error_count,
          errorSummary: extraction.data.error_summary,
        }
      : null,
  };
}

export async function loadAdminCatalogueSummary(): Promise<AdminCatalogueSummary> {
  const supabase = await createClient();
  const [{ data: itemYears }, { data: items }, { data: appliedTargets }] =
    await Promise.all([
      supabase
        .from("catalogue_records")
        .select("id,kind,published_version_id,archived_at"),
      supabase.from("catalogue_codes").select("kind"),
      supabase
        .from("catalogue_import_targets")
        .select("record_id,applied_version_id,created_at")
        .not("applied_version_id", "is", null)
        .order("created_at", { ascending: false }),
    ]);
  const summary = Object.fromEntries(
    (Object.keys(CATALOGUE_KIND_LABELS) as CatalogueKind[]).map((kind) => [
      kind,
      { published: 0, drafts: 0, identities: 0 },
    ]),
  ) as AdminCatalogueSummary;
  for (const item of items ?? [])
    summary[item.kind as CatalogueKind].identities += 1;
  const latestAppliedByRecord = new Map<number, number>();
  for (const target of appliedTargets ?? []) {
    if (
      !latestAppliedByRecord.has(target.record_id) &&
      target.applied_version_id
    )
      latestAppliedByRecord.set(target.record_id, target.applied_version_id);
  }
  for (const year of itemYears ?? []) {
    const bucket = summary[year.kind as CatalogueKind];
    if (year.published_version_id && !year.archived_at) bucket.published += 1;
    const appliedVersionId = latestAppliedByRecord.get(year.id);
    if (appliedVersionId && appliedVersionId !== year.published_version_id)
      bucket.drafts += 1;
  }
  return summary;
}
