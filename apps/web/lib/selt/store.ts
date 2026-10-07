import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import type { SyncSql } from "../catalogue-sync/sync-store";
import { SELT_SOURCE, type SeltReport } from "./contract";

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function createSeltRun(sql: SyncSql, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const [run] =
    await sql`insert into public.selt_import_runs (requested_by, token_sha256) values (${userId}, ${tokenHash(token)}) returning id, expires_at`;
  return { id: String(run.id), expiresAt: String(run.expires_at), token };
}

/** Serialise uploads with revocation and recheck the issuer's current permission. */
export async function withSeltToken<T>(
  sql: SyncSql,
  token: string,
  callback: (tx: postgres.TransactionSql, runId: string) => Promise<T>,
) {
  return sql.begin(async (tx) => {
    const [run] = await tx`select r.id from public.selt_import_runs r
      where r.token_sha256 = ${tokenHash(token)} and r.revoked_at is null and r.expires_at > now()
      and exists (select 1 from private.user_roles ur join private.role_permissions rp on rp.role_id = ur.role_id
        join private.app_permissions p on p.id = rp.permission_id where ur.user_id = r.requested_by and p.key = 'imports.manage')
      for update of r`;
    if (!run) throw new SeltAuthenticationError();
    return callback(tx, String(run.id));
  }) as Promise<T>;
}
export class SeltAuthenticationError extends Error {
  constructor() {
    super("The SELT import token is invalid, expired or revoked.");
  }
}

export async function importSeltReport(
  sql: SyncSql,
  token: string,
  report: SeltReport,
) {
  return withSeltToken(sql, token, async (tx, runId) => {
    const [code] =
      await tx`select id from public.catalogue_codes where kind = 'course' and code = ${report.report.course_code}`;
    if (!code)
      throw new TypeError("The course is not in the Coursemap catalogue.");
    const [saved] =
      await tx`insert into public.selt_reports (code_id, import_run_id, course_name, source_url, source_sha256, source_filename, source_bytes, report_run_at, parser_version, notes, warnings, subject_owner, source_name, source_contact, report_run_at_raw, page_count, text_extractor, chart_extractor, schema_version)
      values (${code.id}, ${runId}, ${report.report.course_name}, ${SELT_SOURCE + report.source.filename}, ${report.source.sha256}, ${report.source.filename}, ${report.source.file_size_bytes}, ${report.report.report_run_at}, ${report.extraction.parser_version}, ${report.notes}, ${report.extraction.warnings}, ${report.report.subject_owner}, ${report.report.source_name}, ${report.report.source_contact}, ${report.report.report_run_at_raw}, ${report.source.page_count}, ${report.extraction.text_extractor}, ${report.extraction.chart_extractor}, ${report.schema_version})
      on conflict (code_id, source_sha256, parser_version) do nothing returning id`;
    if (!saved)
      return { outcome: "unchanged" as const, code: report.report.course_code };
    for (const theme of report.question_themes) {
      await tx`insert into public.selt_question_themes (report_id, key, label, introduced_year) values (${saved.id}, ${theme.key}, ${theme.label}, ${theme.introduced_year})`;
    }
    for (const item of report.surveys) {
      const m = item.agreement_percent;
      await tx`insert into public.selt_surveys (report_id, year, session, label, enrolments, respondents, response_rate_percent, teaching_and_learning_activities, workload, feedback, analytical_development, overall_learning_experience)
        values (${saved.id}, ${item.year}, ${item.session}, ${item.label}, ${item.enrolments}, ${item.respondents}, ${item.response_rate_percent}, ${m.teaching_and_learning_activities}, ${m.workload}, ${m.feedback}, ${m.analytical_development}, ${m.overall_learning_experience})`;
    }
    return {
      outcome: "imported" as const,
      code: report.report.course_code,
      id: String(saved.id),
    };
  });
}

export async function publishSeltReport(
  sql: SyncSql,
  reportId: string,
  userId: string,
) {
  await sql.begin(async (tx) => {
    const [report] =
      await tx`select code_id, warnings from public.selt_reports where id = ${reportId}`;
    if (!report) throw new TypeError("The SELT report does not exist.");
    if (report.warnings.length)
      throw new TypeError(
        "Resolve extraction warnings before publishing this report.",
      );
    // Lock the stable course so concurrent publication cannot select two reports.
    await tx`select id from public.catalogue_codes where id = ${report.code_id} for update`;
    await tx`update public.selt_reports set published_at = null, published_by = null where code_id = ${report.code_id} and published_at is not null`;
    await tx`update public.selt_reports set published_at = now(), published_by = ${userId} where id = ${reportId}`;
  });
}
