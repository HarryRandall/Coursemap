import "server-only";
import type { CourseRunProgress } from "./progress";
import {
  canManageCatalogueOperations,
  canWriteCourses,
  canWriteCatalogue,
  getAuthViewer,
} from "../auth/viewer";
import { loadImportModelSetting } from "../admin/settings";
import { withSyncDatabaseClient } from "../catalogue-sync/sync-store";
export { advanceCourseRun } from "./advance";
import { bulkImportAdapter } from "./adapter";
import { isBulkImportKind } from "./kinds";
import { courseRunEstimate } from "./estimates";
import { ensureCourseRunPricing } from "./pricing";
import { fetchCatalogueModel } from "../admin/model-catalogue";

export async function requireCourseRunAdministrator() {
  if (!(await canManageCatalogueOperations()))
    throw new Error("Catalogue import permission is required.");
  const viewer = await getAuthViewer();
  if (!viewer) throw new Error("Authentication is required.");
  return viewer;
}

export { parseCourseRunOptions } from "./options";
import type { parseCourseRunOptions } from "./options";

async function runModel({ allowAi }: { allowAi: boolean }) {
  const setting = await loadImportModelSetting();
  const model = setting.models.find((item) => item.id === setting.model);
  if (!model) throw new Error("Choose an enabled import model first.");
  if (!allowAi) return model;
  return ensureCourseRunPricing(model, {
    fetchModel: fetchCatalogueModel,
    savePricing: async (fresh) => {
      await withSyncDatabaseClient(async (sql) => {
        const rows =
          await sql`update public.import_models set input_usd_per_million = ${fresh.input_usd_per_million}, output_usd_per_million = ${fresh.output_usd_per_million}, pricing_updated_at = ${fresh.pricing_updated_at}::timestamptz where id = ${fresh.id} and enabled returning id`;
        if (!rows.length)
          throw new Error("The import model is no longer enabled.");
      });
    },
  });
}

export async function previewCourseRun(
  options: ReturnType<typeof parseCourseRunOptions>,
) {
  const model = await runModel({ allowAi: options.allowAi });
  const adapter = bulkImportAdapter(options.kind);
  const records = await withSyncDatabaseClient(
    (sql) => sql`
    select records.id, codes.code, count(*) over() as available_count from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_listings listings on listings.code_id = records.code_id and listings.academic_year_id = records.academic_year_id
    where records.kind = ${options.kind} and years.year = ${options.year}
      and (${options.codes === undefined} or codes.code = any(${sql.array(options.codes ?? [])}::text[]))
      and records.archived_at is null and listings.is_current
      and records.latest_source_version_id is null and records.published_version_id is null
      and not exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = records.id)
      and not exists (select 1 from public.catalogue_syncs syncs where syncs.record_id = records.id and syncs.status in ('queued', 'running'))
    order by codes.code limit ${options.limit}
  `,
  );
  const [sample] = options.allowAi
    ? await withSyncDatabaseClient(
        (sql) => sql`
    select count(*) as sample_count, avg(items.actual_usd) as average_cost
    from public.catalogue_course_run_items items
    join public.catalogue_course_runs runs on runs.id = items.run_id
    join public.catalogue_syncs syncs on syncs.id = items.sync_id
    where items.actual_usd is not null and syncs.source_version_id is not null
      and syncs.status in ('applied', 'review_required', 'unchanged')
      and syncs.parser_version = ${adapter.parserVersion}
      and runs.kind = ${options.kind}
      and runs.requested_model = ${model.id}
      and runs.input_usd_per_million = ${model.input_usd_per_million!}
      and runs.output_usd_per_million = ${model.output_usd_per_million!}
      and runs.created_at > now() - interval '30 days'
  `,
      )
    : [{ sample_count: 0, average_cost: null }];
  const inputPrice = model.input_usd_per_million ?? 0;
  const outputPrice = model.output_usd_per_million ?? 0;
  return {
    model: model.id,
    count: records.length,
    availableCount: Number(records[0]?.available_count ?? 0),
    requestedLimit: options.limit,
    ...courseRunEstimate({
      count: records.length,
      kind: options.kind,
      model: model.id,
      inputPrice,
      outputPrice,
      sampleCount: Number(sample.sample_count),
      averageCost:
        sample.average_cost === null ? null : Number(sample.average_cost),
      allowAi: options.allowAi,
    }),
    budgetUsd: options.budgetUsd,
    records: records.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
    })),
    inputPrice,
    outputPrice,
  };
}

export async function createCourseRun(
  options: ReturnType<typeof parseCourseRunOptions>,
) {
  const viewer = await requireCourseRunAdministrator();
  if (
    options.publishVerified &&
    !(await (options.kind === "course"
      ? canWriteCourses()
      : canWriteCatalogue()))
  )
    throw new Error("Catalogue publication permission is required.");
  const preview = await previewCourseRun(options);
  const adapter = bulkImportAdapter(options.kind);
  if (!preview.count)
    throw new Error(
      "No unimported records match this year and selection. Refresh the ANU listing or change the selected codes.",
    );
  const runId = await withSyncDatabaseClient((sql) =>
    sql.begin(async (tx) => {
      const [run] =
        await tx`insert into public.catalogue_course_runs (kind, academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million, publish_verified, allow_ai) values (${options.kind}, ${options.year}, ${viewer.id}::uuid, ${preview.model}, ${options.limit}, ${options.budgetUsd}, ${preview.inputPrice}, ${preview.outputPrice}, ${options.publishVerified}, ${options.allowAi}) returning id`;
      for (const record of preview.records) {
        const [sync] = await tx`
        insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version, requested_by)
        select records.id, 'manual', ${preview.model}, ${adapter.parserVersion}, ${adapter.promptVersion}, ${adapter.schemaVersion}, ${viewer.id}::uuid
        from public.catalogue_records records where records.id = ${record.id} and records.latest_source_version_id is null and records.published_version_id is null and records.archived_at is null
          and not exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = records.id)
        returning id
      `;
        if (!sync) continue;
        await tx`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${run.id}::uuid, ${record.id}, ${sync.id}::uuid)`;
      }
      return String(run.id);
    }),
  );
  return { runId };
}

export async function readCourseRuns(
  year?: number,
  {
    runId,
    page = 1,
    pageSize = 25,
    query = "",
    status = "",
    kind = "",
  }: {
    runId?: string;
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string;
    kind?: string;
  } = {},
) {
  return withSyncDatabaseClient(
    (sql) => sql<
      (CourseRunProgress & { academic_year: number; matched_count: number })[]
    >`
    with summaries as (select runs.id, runs.kind, runs.academic_year,
      case when runs.state = 'active' and bool_or(syncs.status = 'paused') then 'paused' else runs.state end as state,
      coalesce(runs.pause_reason, max(syncs.error_message) filter (where syncs.status = 'paused')) as pause_reason, runs.created_at, runs.requested_by, runs.budget_usd, runs.publish_verified, runs.allow_ai,
      (select coalesce(jsonb_agg(blockers), '[]'::jsonb) from (
        select flag->>'message' as reason, count(distinct run_items.record_id)::integer as courses
        from public.catalogue_course_run_items run_items
        join public.catalogue_syncs run_syncs on run_syncs.id = run_items.sync_id
        join public.catalogue_drafts drafts on drafts.record_id = run_items.record_id
        cross join lateral jsonb_array_elements(drafts.content->'flags') flag
        where run_items.run_id = runs.id and run_items.published_version_id is null
          and run_syncs.status in ('applied', 'review_required', 'unchanged')
        group by flag->>'message' order by count(distinct run_items.record_id) desc, flag->>'message'
      ) blockers) as publication_blockers,
      min(syncs.started_at) as started_at,
      max(syncs.completed_at) as completed_at,
      count(items.record_id)::integer as total,
      count(*) filter (where syncs.status in ('applied', 'review_required', 'unchanged', 'failed', 'cancelled'))::integer as finished,
      count(*) filter (where syncs.status in ('applied', 'review_required', 'unchanged') and items.published_version_id is null and exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = items.record_id) and (exists (select 1 from public.catalogue_sync_changes changes where changes.sync_id = syncs.id and changes.decision is null and changes.superseded_at is null and changes.review_band in ('check', 'needs_review')) or exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = items.record_id and jsonb_array_length(drafts.content->'flags') > 0)))::integer as review,
      count(*) filter (where syncs.status in ('applied', 'review_required', 'unchanged') and items.published_version_id is null
        and exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = items.record_id and jsonb_array_length(drafts.content->'flags') = 0)
        and not exists (select 1 from public.catalogue_sync_changes changes where changes.sync_id = syncs.id and changes.decision is null and changes.superseded_at is null and changes.review_band in ('check', 'needs_review')))::integer as drafts,
      count(*) filter (where syncs.status = 'failed')::integer as failed,
      count(*) filter (where syncs.status = 'cancelled')::integer as stopped,
      count(items.published_version_id)::integer as published,
      count(*) filter (where items.published_version_id is not null and exists (select 1 from public.catalogue_drafts drafts where drafts.record_id = items.record_id))::integer as published_drafts,
      count(syncs.source_version_id)::integer as imported,
      count(*) filter (where items.actual_usd > 0)::integer as paid_courses,
      count(*) filter (where items.actual_usd = 0 and syncs.source_version_id is not null)::integer as free_courses,
      coalesce(sum(items.actual_usd), 0) as spent_usd,
      coalesce(sum(case when items.actual_usd is null then items.reserved_usd else 0 end), 0) as reserved_usd
    from public.catalogue_course_runs runs left join public.catalogue_course_run_items items on items.run_id = runs.id
    left join public.catalogue_syncs syncs on syncs.id = items.sync_id
    where (${kind} = '' or runs.kind = ${kind}) and (${year ?? null}::integer is null or runs.academic_year = ${year ?? null})
      and (${runId ?? null}::uuid is null or runs.id = ${runId ?? null}::uuid)
      and (${query} = '' or runs.academic_year::text ilike ${`%${query}%`} or exists (
        select 1 from public.catalogue_course_run_items search_items
        join public.catalogue_records search_records on search_records.id = search_items.record_id
        join public.catalogue_codes search_codes on search_codes.id = search_records.code_id
        where search_items.run_id = runs.id and search_codes.code ilike ${`%${query}%`}
      ))
    group by runs.id)
    select *, count(*) over()::integer as matched_count from summaries
    where (${status} = '' or (case when state = 'cancelled' then 'stopped' when state = 'paused' then 'paused' when finished = total then 'finished' else 'incomplete' end) = ${status})
    order by created_at desc, id desc limit ${pageSize} offset ${(page - 1) * pageSize}
  `,
  );
}

export async function readCourseRunHistory(
  page: number,
  filters: {
    query?: string;
    status?: string;
    year?: number;
    kind?: string;
  } = {},
) {
  const query = (filters.query ?? "").trim().slice(0, 200);
  const status = ["finished", "incomplete", "paused", "stopped"].includes(
    filters.status ?? "",
  )
    ? filters.status!
    : "";
  const kind = isBulkImportKind(filters.kind) ? filters.kind : "";
  const options = { page, query, status, kind };
  const runs = await readCourseRuns(filters.year, options);
  // A stale page link still needs the filtered total to offer valid navigation.
  const first =
    runs.length || page === 1
      ? runs[0]
      : (
          await readCourseRuns(filters.year, {
            ...options,
            page: 1,
            pageSize: 1,
          })
        )[0];
  return {
    runs,
    total: Number(first?.matched_count ?? 0),
    page,
    pageSize: 25,
    query,
    status,
    year: filters.year,
    kind,
  };
}

export async function cancelCourseRun(runId: string) {
  await withSyncDatabaseClient((sql) =>
    sql.begin(async (tx) => {
      await tx`update public.catalogue_course_runs set state = 'cancelled' where id = ${runId}::uuid`;
      await tx`update public.catalogue_syncs set status = 'cancelled', completed_at = now() where id in (select sync_id from public.catalogue_course_run_items where run_id = ${runId}::uuid) and status = 'queued'`;
    }),
  );
}

/** A bounded result page, independent of directory filters and publication state. */
export async function readCourseRunItems(
  year: number,
  runId: string,
  page: number,
  needsReview = false,
  filters: { query?: string; outcome?: string; issue?: string } = {},
) {
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql`
      with results as (select records.id as record_id, codes.code, coalesce(drafts.content #>> '{course,details,title}', drafts.content #>> '{structure,details,name}', listings.title, codes.code) as title,
        syncs.status, syncs.error_message, items.actual_usd,
        records.published_version_id, drafts.content,
        coalesce((select jsonb_agg(distinct reason) from (
          select flag->>'message' as reason from jsonb_array_elements(coalesce(drafts.content->'flags', '[]'::jsonb)) flag
          union
          select changes.review_reason from public.catalogue_sync_changes changes
          where changes.record_id = records.id and changes.superseded_at is null and changes.decision is null and changes.review_band in ('check', 'needs_review')
        ) concerns where reason is not null), '[]'::jsonb) as issues
      from public.catalogue_course_run_items items
      join public.catalogue_course_runs runs on runs.id = items.run_id
      join public.catalogue_records records on records.id = items.record_id
      join public.catalogue_codes codes on codes.id = records.code_id
      join public.catalogue_syncs syncs on syncs.id = items.sync_id
      left join public.catalogue_listings listings on listings.code_id = records.code_id and listings.academic_year_id = records.academic_year_id
      left join public.catalogue_drafts drafts on drafts.record_id = records.id
      where runs.id = ${runId}::uuid and runs.academic_year = ${year}
      ), classified as (select *, case
        when status = 'failed' then 'failed'
        when status = 'cancelled' then 'stopped'
        when status in ('queued', 'running', 'paused') then 'pending'
        when published_version_id is not null then 'published'
        when jsonb_array_length(issues) > 0 then 'review'
        when content is not null then 'draft'
        else 'pending' end as outcome from results
      ), filtered as (select * from classified
      where (not ${needsReview} or outcome = 'review')
        and (${filters.query ?? ""} = '' or code ilike ${`%${filters.query ?? ""}%`} or title ilike ${`%${filters.query ?? ""}%`})
        and (${filters.outcome ?? ""} = '' or outcome = ${filters.outcome ?? ""})
        and (${filters.issue ?? ""} = '' or issues ? ${filters.issue ?? ""})
      ) select *, count(*) over() as total from filtered
      order by code limit 25 offset least(${(page - 1) * 25}, (select greatest(0, ceil(count(*) / 25.0)::integer - 1) * 25 from filtered))
    `;
    return {
      total: Number(rows[0]?.total ?? 0),
      page: Math.min(
        page,
        Math.max(1, Math.ceil(Number(rows[0]?.total ?? 0) / 25)),
      ),
      pageSize: 25,
      items: rows.map((row) => ({
        recordId: Number(row.record_id),
        code: String(row.code),
        title: row.title === null ? String(row.code) : String(row.title),
        status: String(row.status),
        published: Boolean(row.published_version_id),
        hasDraft: Boolean(row.content),
        issues: row.issues as string[],
        error: row.error_message === null ? null : String(row.error_message),
        actualUsd: row.actual_usd === null ? null : Number(row.actual_usd),
      })),
    };
  });
}
