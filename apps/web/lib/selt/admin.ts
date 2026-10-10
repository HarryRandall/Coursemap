import "server-only";

import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import type { SeltReportStatus } from "@/lib/selt/admin-format";

export const SELT_ADMIN_PAGE_SIZE = 25;

export type SeltAdminSummary = {
  /** Published courses this year that have a published report. */
  coveredCourses: number;
  /** Published courses this year, the denominator for coverage. */
  publishedCourses: number;
  published: number;
  ready: number;
  blocked: number;
};

export type SeltAdminReportRow = {
  id: string;
  code: string;
  courseName: string;
  status: SeltReportStatus;
  /** A draft that would replace this course's currently published report. */
  replacesPublished: boolean;
  warnings: string[];
  createdAt: string;
  periods: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Overall experience per semester, oldest first; null where suppressed. */
  overall: (number | null)[];
  sourceUrl: string;
};

export type SeltAdminReportPage = {
  rows: SeltAdminReportRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  status: SeltReportStatus | null;
};

export type SeltAdminToken = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string | null;
  reports: number;
  lastUploadAt: string | null;
};

export async function loadSeltAdminSummary(
  year = new Date().getFullYear(),
): Promise<SeltAdminSummary> {
  return withSyncDatabaseClient(async (sql) => {
    const [row] = await sql`
      with published_courses as (
        select distinct records.code_id
        from public.catalogue_records as records
        join public.academic_years as years on years.id = records.academic_year_id
        where records.kind = 'course'
          and years.year = ${year}
          and records.published_version_id is not null
          and records.archived_at is null
      )
      select
        (select count(*) from published_courses)::integer as published_courses,
        (select count(distinct reports.code_id)
          from public.selt_reports as reports
          join published_courses using (code_id)
          where reports.published_at is not null)::integer as covered_courses,
        count(*) filter (where published_at is not null)::integer as published,
        count(*) filter (
          where published_at is null and cardinality(warnings) = 0
        )::integer as ready,
        count(*) filter (
          where published_at is null and cardinality(warnings) > 0
        )::integer as blocked
      from public.selt_reports`;
    return {
      coveredCourses: row.covered_courses,
      publishedCourses: row.published_courses,
      published: row.published,
      ready: row.ready,
      blocked: row.blocked,
    };
  });
}

export async function loadSeltAdminReports({
  query,
  status,
  page,
}: {
  query: string;
  status: SeltReportStatus | null;
  page: number;
}): Promise<SeltAdminReportPage> {
  const search = query.trim();
  const offset = (page - 1) * SELT_ADMIN_PAGE_SIZE;
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql`
      with reports as (
        select
          reports.id,
          codes.code,
          reports.course_name,
          reports.created_at,
          reports.warnings,
          reports.source_url,
          case
            when reports.published_at is not null then 'published'
            when cardinality(reports.warnings) > 0 then 'blocked'
            else 'ready'
          end as status,
          exists (
            select 1 from public.selt_reports as current
            where current.code_id = reports.code_id
              and current.published_at is not null
              and current.id <> reports.id
          ) as replaces_published
        from public.selt_reports as reports
        join public.catalogue_codes as codes on codes.id = reports.code_id
        where ${search} = ''
          or codes.code ilike ${`${search}%`}
          or reports.course_name ilike ${`%${search}%`}
      )
      select
        reports.*,
        count(*) over ()::integer as total,
        surveys.periods,
        surveys.first_year,
        surveys.last_year,
        surveys.overall
      from reports
      left join lateral (
        select
          count(*)::integer as periods,
          min(year) as first_year,
          max(year) as last_year,
          array_agg(overall_learning_experience order by year, session) as overall
        from public.selt_surveys
        where report_id = reports.id
      ) as surveys on true
      where ${status === null} or reports.status = ${status ?? ""}
      -- Work waiting on an administrator comes first.
      order by
        case reports.status when 'blocked' then 0 when 'ready' then 1 else 2 end,
        reports.code,
        reports.created_at desc
      limit ${SELT_ADMIN_PAGE_SIZE} offset ${offset}`;
    return {
      rows: rows.map((row) => ({
        id: String(row.id),
        code: row.code,
        courseName: row.course_name,
        status: row.status,
        replacesPublished: row.replaces_published,
        warnings: row.warnings,
        createdAt: new Date(row.created_at).toISOString(),
        periods: row.periods,
        firstYear: row.first_year,
        lastYear: row.last_year,
        // Postgres.js decodes NULL in integer arrays as NaN.
        overall: (row.overall ?? []).map((value: number | null) =>
          Number.isNaN(value) ? null : value,
        ),
        sourceUrl: row.source_url,
      })),
      total: rows[0]?.total ?? 0,
      page,
      pageSize: SELT_ADMIN_PAGE_SIZE,
      query: search,
      status,
    };
  });
}

export async function loadSeltAdminTokens(): Promise<SeltAdminToken[]> {
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql`
      select
        runs.id,
        runs.created_at,
        runs.expires_at,
        runs.revoked_at,
        profiles.display_name,
        count(reports.id)::integer as reports,
        max(reports.created_at) as last_upload_at
      from public.selt_import_runs as runs
      left join public.profiles on profiles.id = runs.requested_by
      left join public.selt_reports as reports on reports.import_run_id = runs.id
      group by runs.id, profiles.display_name
      order by runs.created_at desc
      limit 50`;
    const iso = (value: unknown) =>
      value ? new Date(value as string).toISOString() : null;
    return rows.map((row) => ({
      id: String(row.id),
      createdAt: iso(row.created_at)!,
      expiresAt: iso(row.expires_at)!,
      revokedAt: iso(row.revoked_at),
      createdBy: row.display_name ?? null,
      reports: row.reports,
      lastUploadAt: iso(row.last_upload_at),
    }));
  });
}

export type SeltAdminSurvey = {
  label: string;
  year: number;
  session: "sem_1" | "sem_2";
  enrolments: number | null;
  respondents: number | null;
  response_rate_percent: number | null;
  teaching_and_learning_activities: number | null;
  workload: number | null;
  feedback: number | null;
  analytical_development: number | null;
  overall_learning_experience: number | null;
};

export type SeltAdminReportDetail = {
  id: string;
  code: string;
  courseName: string;
  status: SeltReportStatus;
  replacesPublished: boolean;
  warnings: string[];
  notes: string[];
  sourceUrl: string;
  sourceName: string | null;
  reportRunAt: string | null;
  parserVersion: string;
  createdAt: string;
  surveys: SeltAdminSurvey[];
};

/** Null when the report does not exist. */
export async function loadSeltAdminReport(
  id: string,
): Promise<SeltAdminReportDetail | null> {
  return withSyncDatabaseClient(async (sql) => {
    const [report] = await sql`
      select
        reports.*,
        codes.code,
        exists (
          select 1 from public.selt_reports as current
          where current.code_id = reports.code_id
            and current.published_at is not null
            and current.id <> reports.id
        ) as replaces_published
      from public.selt_reports as reports
      join public.catalogue_codes as codes on codes.id = reports.code_id
      where reports.id = ${id}`;
    if (!report) return null;
    const surveys = await sql<SeltAdminSurvey[]>`
      select label, year, session, enrolments, respondents,
        response_rate_percent, teaching_and_learning_activities, workload,
        feedback, analytical_development, overall_learning_experience
      from public.selt_surveys
      where report_id = ${id}
      order by year, session`;
    return {
      id: String(report.id),
      code: report.code,
      courseName: report.course_name,
      status: report.published_at
        ? "published"
        : report.warnings.length
          ? "blocked"
          : "ready",
      replacesPublished: report.replaces_published,
      warnings: report.warnings,
      notes: report.notes,
      sourceUrl: report.source_url,
      sourceName: report.source_name,
      reportRunAt: report.report_run_at
        ? new Date(report.report_run_at).toISOString()
        : null,
      parserVersion: report.parser_version,
      createdAt: new Date(report.created_at).toISOString(),
      surveys: [...surveys],
    };
  });
}
