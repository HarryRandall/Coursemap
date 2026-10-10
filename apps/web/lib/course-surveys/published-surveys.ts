import "server-only";
import { createPublicClient } from "@/lib/supabase/public-server";
import type { PublishedSurveyReport } from "./report-model";

export async function loadPublishedSurveyReport(
  code: string,
): Promise<PublishedSurveyReport | null> {
  const client = createPublicClient();
  const { data: identity, error: identityError } = await client
    .from("catalogue_codes")
    .select("id")
    .eq("kind", "course")
    .eq("code", code)
    .maybeSingle();
  if (identityError) throw new Error("The survey course could not be loaded.");
  if (!identity) return null;
  // Public code visibility also includes placeholders referenced by requisites.
  const { data: record, error: recordError } = await client
    .from("catalogue_records")
    .select("id")
    .eq("code_id", identity.id)
    .not("published_version_id", "is", null)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (recordError) throw new Error("The survey course could not be loaded.");
  if (!record) return null;
  const { data: report, error } = await client
    .from("selt_reports")
    .select("id, source_name, source_url, report_run_at, notes")
    .eq("code_id", identity.id)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error)
    throw new Error("The published survey report could not be loaded.");
  if (!report) return null;
  const { data: surveys, error: surveyError } = await client
    .from("selt_surveys")
    .select(
      "year,session,enrolments,respondents,response_rate_percent,teaching_and_learning_activities,workload,feedback,analytical_development,overall_learning_experience",
    )
    .eq("report_id", report.id)
    .order("year")
    .order("session");
  if (surveyError) throw new Error("The survey periods could not be loaded.");
  return {
    courseCode: code,
    sourceName: report.source_name ?? "ANU SELT",
    sourceUrl: report.source_url,
    reportRunAt: report.report_run_at,
    notes: report.notes,
    surveys: (surveys ?? []).map((row) => ({
      year: row.year,
      session: row.session as "sem_1" | "sem_2",
      enrolments: row.enrolments,
      respondents: row.respondents,
      responseRatePercent: row.response_rate_percent,
      agreementPercent: {
        teaching_and_learning_activities: row.teaching_and_learning_activities,
        workload: row.workload,
        feedback: row.feedback,
        analytical_development: row.analytical_development,
        overall_learning_experience: row.overall_learning_experience,
      },
    })),
  };
}
