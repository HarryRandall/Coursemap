import { z } from "zod";

export const SELT_SOURCE =
  "https://unistats.anu.edu.au/internal/surveys/selt/learning/time-series/";
export const COURSE_CODE = /^[A-Z]{4}[0-9]{4}$/u;
export const SELT_METRICS = [
  "teaching_and_learning_activities",
  "workload",
  "feedback",
  "analytical_development",
  "overall_learning_experience",
] as const;
const percent = z.number().int().min(0).max(100).nullable();
const text = z.string().min(1).max(2000);
const count = z.number().int().min(0).max(1000000).nullable();
const survey = z
  .object({
    label: text,
    year: z.number().int().min(1990).max(2100),
    session: z.enum(["sem_1", "sem_2"]),
    enrolments: count,
    respondents: count,
    response_rate_percent: percent,
    agreement_percent: z
      .object({
        teaching_and_learning_activities: percent,
        workload: percent,
        feedback: percent,
        analytical_development: percent,
        overall_learning_experience: percent,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.respondents !== null &&
      value.enrolments !== null &&
      value.respondents > value.enrolments
    )
      context.addIssue({
        code: "custom",
        message: "Respondents exceed enrolments.",
      });
    if (
      (value.respondents === null || value.respondents < 5) &&
      SELT_METRICS.some((key) => value.agreement_percent[key] !== null)
    )
      context.addIssue({
        code: "custom",
        message: "Suppressed survey results must remain empty.",
      });
  });
export const seltReportSchema = z
  .object({
    schema_version: z.literal("selt-course-time-series.v1"),
    report: z
      .object({
        type: z.literal("course_survey_quantitative_results"),
        course_code: z.string().regex(COURSE_CODE),
        course_name: text,
        subject_owner: text.nullable(),
        report_run_at: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u)
          .nullable(),
        report_run_at_raw: text.nullable(),
        source_name: text.nullable(),
        source_contact: text.nullable(),
      })
      .strict(),
    question_themes: z
      .array(
        z
          .object({
            key: z.enum(SELT_METRICS),
            label: text,
            introduced_year: z.number().int().min(1990).max(2100),
          })
          .strict(),
      )
      .length(5),
    surveys: z.array(survey).min(1).max(100),
    notes: z.array(text).max(50),
    source: z
      .object({
        filename: z.string().max(100),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        file_size_bytes: z.number().int().positive().max(10000000),
        page_count: z.number().int().min(1).max(20),
      })
      .strict(),
    extraction: z
      .object({
        parser: text,
        parser_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u),
        text_extractor: text,
        chart_extractor: text,
        warnings: z.array(text).max(100),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.source.filename !==
      `${value.report.course_code}_Time_Series_LRN.pdf`
    )
      context.addIssue({
        code: "custom",
        message: "The source filename does not match the course.",
      });
    if (new Set(value.question_themes.map((theme) => theme.key)).size !== 5)
      context.addIssue({
        code: "custom",
        message: "Survey themes must be unique.",
      });
    const periods = value.surveys.map((item) => `${item.year}/${item.session}`);
    if (new Set(periods).size !== periods.length)
      context.addIssue({
        code: "custom",
        message: "Survey periods must be unique.",
      });
  });
export type SeltReport = z.infer<typeof seltReportSchema>;
