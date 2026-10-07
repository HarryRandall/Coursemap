import { SELT_METRICS, type SeltReport } from "../../../lib/selt/contract";

/** Synthetic report for import validation; contains no downloaded ANU data. */
export function syntheticSeltReport(): SeltReport {
  return {
    schema_version: "selt-course-time-series.v1",
    report: {
      type: "course_survey_quantitative_results",
      course_code: "TEST1234",
      course_name: "Synthetic survey course",
      subject_owner: "Test college",
      report_run_at: "2026-07-09T09:44:18",
      report_run_at_raw: null,
      source_name: "Synthetic fixture",
      source_contact: null,
    },
    question_themes: SELT_METRICS.map((key) => ({
      key,
      label: key,
      introduced_year: 2019,
    })),
    surveys: [
      {
        label: "Sem 1 2025",
        year: 2025,
        session: "sem_1",
        enrolments: 100,
        respondents: 20,
        response_rate_percent: 20,
        agreement_percent: {
          teaching_and_learning_activities: 70,
          workload: 60,
          feedback: 50,
          analytical_development: 80,
          overall_learning_experience: 75,
        },
      },
    ],
    notes: ["Synthetic fixture."],
    source: {
      filename: "TEST1234_Time_Series_LRN.pdf",
      sha256: "a".repeat(64),
      file_size_bytes: 1000,
      page_count: 1,
    },
    extraction: {
      parser: "apps/web/scripts/selt/extract_report.py",
      parser_version: "0.1.0",
      text_extractor: "pdftotext -layout",
      chart_extractor: "pdfplumber vector line geometry",
      warnings: [],
    },
  };
}
