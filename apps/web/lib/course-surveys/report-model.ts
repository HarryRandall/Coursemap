import {
  SURVEY_THEMES,
  type CourseSurveyResults,
  type SurveySemester,
  type SurveyThemeKey,
} from "./survey-results";

export type ReportedSurveyPeriod = {
  year: number;
  session: "sem_1" | "sem_2";
  enrolments: number | null;
  respondents: number | null;
  responseRatePercent: number | null;
  agreementPercent: Record<SurveyThemeKey, number | null>;
};
export type PublishedSurveyReport = {
  courseCode: string;
  sourceName: string;
  sourceUrl: string;
  reportRunAt: string | null;
  notes: string[];
  surveys: ReportedSurveyPeriod[];
};

/** Charts require complete periods. The table retains every reported value. */
export function completeSurveyResults(
  report: PublishedSurveyReport,
): CourseSurveyResults {
  const surveys: SurveySemester[] = [];
  for (const item of report.surveys) {
    if (
      item.enrolments === null ||
      item.respondents === null ||
      item.respondents < 5 ||
      SURVEY_THEMES.some((theme) => item.agreementPercent[theme.key] === null)
    )
      continue;
    surveys.push({
      year: item.year,
      session: item.session,
      enrolments: item.enrolments,
      respondents: item.respondents,
      agreementPercent: Object.fromEntries(
        SURVEY_THEMES.map((theme) => [
          theme.key,
          item.agreementPercent[theme.key]!,
        ]),
      ) as Record<SurveyThemeKey, number>,
    });
  }
  return {
    courseCode: report.courseCode,
    sourceName: report.sourceName,
    surveys,
  };
}
