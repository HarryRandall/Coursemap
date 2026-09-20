import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  type AdminCatalogueSummary,
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryPage,
  type CatalogueDirectoryRecord,
  type CatalogueKind,
  DEFAULT_IMPORT_RUN_SORT,
  type DirectoryFilter,
  type DirectoryWorkflowStatus,
  type ImportRunProgress,
  type ImportRunRow,
  type ImportRunSort,
  type ImportRunSummary,
  type ImportRunsPage,
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

export async function loadCatalogueYears() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("year")
    .gte("year", 2020)
    .lte("year", 2030)
    .order("year", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.year);
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
    .from("catalogue_item_years")
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
        .from("catalogue_directory_statuses")
        .select("status,refreshed_at,message,entry_count")
        .eq("academic_year_id", yearRow.id)
        .eq("kind", kind)
        .maybeSingle(),
      supabase
        .from("catalogue_directory_entries")
        .select("code,title,summary,item_id")
        .eq("academic_year_id", yearRow.id)
        .eq("kind", kind)
        .eq("is_current", true)
        .order("code"),
      supabase
        .from("catalogue_item_years")
        .select(
          "item_id,public_id,draft_snapshot_id,published_snapshot_id,archived_at",
        )
        .eq("academic_year_id", yearRow.id)
        .eq("kind", kind),
      supabase
        .from("catalogue_import_targets")
        .select(
          "id,run_id,item_id,status,change_kind,error_message,completed_at,created_at",
        )
        .eq("academic_year_id", yearRow.id)
        .eq("kind", kind)
        .order("created_at", { ascending: false }),
    ]);
  if (statusResult.error) throw statusResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (itemYearsResult.error) throw itemYearsResult.error;
  if (targetsResult.error) throw targetsResult.error;

  const itemYearByItem = new Map(
    (itemYearsResult.data ?? []).map((row) => [row.item_id, row]),
  );
  const latestTargetByItem = new Map<
    number,
    (typeof targetsResult.data)[number]
  >();
  for (const target of targetsResult.data ?? []) {
    if (!latestTargetByItem.has(target.item_id)) {
      latestTargetByItem.set(target.item_id, target);
    }
  }

  // Items imported directly (without a directory row) still appear so the
  // administrator can see everything the year holds.
  const entryCodes = new Set((entriesResult.data ?? []).map((row) => row.code));
  const extraItemIds = [...itemYearByItem.keys()].filter(
    (itemId) =>
      !(entriesResult.data ?? []).some((entry) => entry.item_id === itemId),
  );
  const { data: extraItems } = extraItemIds.length
    ? await supabase
        .from("catalogue_items")
        .select("id,code")
        .in("id", extraItemIds)
    : { data: [] as Array<{ id: number; code: string }> };

  const allRecords: CatalogueDirectoryRecord[] = [
    ...(entriesResult.data ?? []).map((entry) => ({
      code: entry.code,
      title: entry.title,
      summary: (entry.summary ?? {}) as Record<string, unknown>,
      itemId: entry.item_id,
    })),
    ...(extraItems ?? [])
      .filter((item) => !entryCodes.has(item.code))
      .map((item) => ({
        code: item.code,
        title: null,
        summary: {},
        itemId: item.id,
      })),
  ]
    .map(({ code, title, summary, itemId }) => {
      const itemYear = itemId === null ? undefined : itemYearByItem.get(itemId);
      const latest =
        itemId === null ? undefined : latestTargetByItem.get(itemId);
      const hasDraft = Boolean(itemYear?.draft_snapshot_id);
      const isPublished =
        Boolean(itemYear?.published_snapshot_id) && !itemYear?.archived_at;
      return {
        code,
        title,
        summary,
        itemYearPublicId: itemYear?.public_id ?? null,
        hasDraft,
        isPublished,
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

const IMPORT_RUN_PAGE_SIZE = 20;

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

/** The targets of one run, which is the only run whose records are on screen. */
async function loadRunTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  runId: string,
): Promise<ImportRunSummary["targets"]> {
  const { data, error } = await supabase
    .from("catalogue_import_targets")
    .select(
      "id,code,status,change_kind,attempt_count,error_code,error_message,candidate_snapshot_id,applied_snapshot_id,catalogue_item_years(public_id),catalogue_directory_entries(title)",
    )
    .eq("run_id", runId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map((target) => ({
    id: target.id,
    code: target.code,
    title: target.catalogue_directory_entries?.title ?? null,
    status: target.status,
    changeKind: target.change_kind,
    attemptCount: target.attempt_count,
    errorCode: target.error_code,
    errorMessage: target.error_message,
    candidateSnapshotId: target.candidate_snapshot_id,
    appliedSnapshotId: target.applied_snapshot_id,
    itemYearPublicId: target.catalogue_item_years?.public_id ?? null,
  }));
}

/**
 * One page of import runs for a kind, narrowed by a search over the run number
 * and the codes it imported, and by run status. Only the selected run carries
 * its targets, because only that run's records are on screen; the list itself
 * reads its counts from the run row.
 */
export async function loadCatalogueImportRuns({
  kind,
  query = "",
  status = "",
  sort = DEFAULT_IMPORT_RUN_SORT,
  page = 1,
  selectedRunId = null,
}: {
  kind: CatalogueKind;
  query?: string;
  status?: string;
  sort?: ImportRunSort;
  page?: number;
  selectedRunId?: string | null;
}): Promise<ImportRunsPage> {
  const supabase = await createClient();
  const needle = query.trim();
  const empty: ImportRunsPage = {
    runs: [],
    selected: null,
    page: 1,
    pageSize: IMPORT_RUN_PAGE_SIZE,
    total: 0,
    sort,
  };

  // A reader looks for a run by its number or by a code it imported, so the
  // codes are resolved to run ids first and both are matched together.
  const clauses: string[] = [];
  if (needle) {
    const runNumber = Number(needle.replace(/^#/, ""));
    if (Number.isInteger(runNumber) && runNumber > 0) {
      clauses.push(`run_number.eq.${runNumber}`);
    }
    const { data: matches, error: matchError } = await supabase
      .from("catalogue_import_targets")
      .select("run_id")
      .eq("kind", kind)
      .ilike("code", `%${needle}%`)
      .limit(1000);
    if (matchError) throw matchError;
    const runIds = [...new Set((matches ?? []).map((match) => match.run_id))];
    if (runIds.length) clauses.push(`id.in.(${runIds.join(",")})`);
    if (clauses.length === 0) return empty;
  }

  let runsQuery = supabase
    .from("catalogue_import_runs")
    .select(RUN_COLUMNS, { count: "exact" })
    .eq("kind", kind);
  if (status) runsQuery = runsQuery.eq("status", status);
  if (clauses.length) runsQuery = runsQuery.or(clauses.join(","));
  runsQuery =
    sort === "oldest"
      ? runsQuery.order("created_at", { ascending: true })
      : sort === "records"
        ? runsQuery.order("target_count", { ascending: false })
        : sort === "cost"
          ? runsQuery.order("cost_usd", { ascending: false })
          : runsQuery.order("created_at", { ascending: false });

  const { count, error: countError } = await runsQuery.range(0, 0);
  if (countError) throw countError;
  const total = count ?? 0;
  const safePage = Math.max(
    1,
    Math.min(page, Math.ceil(total / IMPORT_RUN_PAGE_SIZE) || 1),
  );
  const from = (safePage - 1) * IMPORT_RUN_PAGE_SIZE;
  const { data, error } = await runsQuery.range(
    from,
    from + IMPORT_RUN_PAGE_SIZE - 1,
  );
  if (error) throw error;
  const runs = ((data ?? []) as RunRow[]).map(runRow);

  const selectedRow =
    runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const selected = selectedRow
    ? {
        ...selectedRow,
        targets: await loadRunTargets(supabase, selectedRow.id),
      }
    : null;

  return {
    runs,
    selected,
    page: safePage,
    pageSize: IMPORT_RUN_PAGE_SIZE,
    total,
    sort,
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
  const [{ data: itemYears }, { data: items }] = await Promise.all([
    supabase
      .from("catalogue_item_years")
      .select("kind,draft_snapshot_id,published_snapshot_id,archived_at"),
    supabase.from("catalogue_items").select("kind"),
  ]);
  const summary = Object.fromEntries(
    (Object.keys(CATALOGUE_KIND_LABELS) as CatalogueKind[]).map((kind) => [
      kind,
      { published: 0, drafts: 0, identities: 0 },
    ]),
  ) as AdminCatalogueSummary;
  for (const item of items ?? [])
    summary[item.kind as CatalogueKind].identities += 1;
  for (const year of itemYears ?? []) {
    const bucket = summary[year.kind as CatalogueKind];
    if (year.published_snapshot_id && !year.archived_at) bucket.published += 1;
    if (year.draft_snapshot_id) bucket.drafts += 1;
  }
  return summary;
}
