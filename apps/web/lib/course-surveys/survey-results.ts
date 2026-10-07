/**
 * Student experience survey (SELT) results for a course. Each value is the
 * percentage of respondents who agreed with the statements in a theme, so a
 * semester with few respondents carries a wide margin of error.
 */
export const SURVEY_THEMES = [
  {
    key: "teaching_and_learning_activities",
    label: "Teaching and learning activities",
    shortLabel: "Teaching",
  },
  { key: "workload", label: "Workload", shortLabel: "Workload" },
  { key: "feedback", label: "Feedback", shortLabel: "Feedback" },
  {
    key: "analytical_development",
    label: "Analytical development",
    shortLabel: "Analytical",
  },
  {
    key: "overall_learning_experience",
    label: "Overall learning experience",
    shortLabel: "Overall",
  },
] as const;

export type SurveyThemeKey = (typeof SURVEY_THEMES)[number]["key"];
export type SurveySession = "sem_1" | "sem_2";

export type SurveySemester = {
  year: number;
  session: SurveySession;
  enrolments: number;
  respondents: number;
  agreementPercent: Record<SurveyThemeKey, number>;
};

export type CourseSurveyResults = {
  courseCode: string;
  sourceName: string;
  /** Surveys in chronological order. */
  surveys: SurveySemester[];
};

export type SurveyThemeSummary = {
  key: SurveyThemeKey;
  label: string;
  shortLabel: string;
  latest: number;
  median: number;
  min: number;
  max: number;
};

export const OVERALL_THEME: SurveyThemeKey = "overall_learning_experience";

export function surveyLabel(survey: SurveySemester) {
  return `${survey.session === "sem_1" ? "Semester 1" : "Semester 2"} ${survey.year}`;
}

export function surveyShortLabel(survey: SurveySemester) {
  return `S${survey.session === "sem_1" ? 1 : 2} ${String(survey.year).slice(2)}`;
}

export function median(values: readonly number[]) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The 90% Wilson score interval for an agreement percentage, rounded to whole
 * percentage points. Wilson stays inside 0 to 100 near the extremes, unlike
 * the normal approximation.
 */
export function agreementInterval(percent: number, respondents: number) {
  if (respondents <= 0) return { low: 0, high: 100 };
  const z = 1.645;
  const p = percent / 100;
  const denominator = 1 + (z * z) / respondents;
  const centre = (p + (z * z) / (2 * respondents)) / denominator;
  const halfWidth =
    (z *
      Math.sqrt(
        (p * (1 - p)) / respondents + (z * z) / (4 * respondents * respondents),
      )) /
    denominator;
  return {
    low: Math.round((centre - halfWidth) * 100),
    high: Math.round((centre + halfWidth) * 100),
  };
}

export function latestSurvey(results: CourseSurveyResults) {
  return results.surveys.at(-1);
}

/** One summary per theme, in survey theme order. Empty when there are no surveys. */
export function themeSummaries(
  results: CourseSurveyResults,
): SurveyThemeSummary[] {
  const latest = latestSurvey(results);
  if (!latest) return [];
  return SURVEY_THEMES.map((theme) => {
    const values = results.surveys.map(
      (survey) => survey.agreementPercent[theme.key],
    );
    return {
      ...theme,
      latest: latest.agreementPercent[theme.key],
      median: median(values),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
}

/**
 * Median overall experience for each session the course has run in. Returns
 * null unless both semesters have at least one survey.
 */
export function sessionMedians(results: CourseSurveyResults) {
  const bySession = (session: SurveySession) =>
    results.surveys
      .filter((survey) => survey.session === session)
      .map((survey) => survey.agreementPercent[OVERALL_THEME]);
  const first = bySession("sem_1");
  const second = bySession("sem_2");
  if (first.length === 0 || second.length === 0) return null;
  return { sem1: median(first), sem2: median(second) };
}
