import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { SURVEY_THEMES } from "@/lib/course-surveys/survey-results";
import {
  completeSurveyResults,
  type PublishedSurveyReport,
} from "@/lib/course-surveys/report-model";
import { ReviewHeatmap } from "@/ui/courses/reviews/review-heatmap";
import { ReviewSummaryCards } from "@/ui/courses/reviews/review-summary-cards";
import { ReviewTrendChart } from "@/ui/courses/reviews/review-trend-chart";

export function CourseSurveyPanel({
  report,
}: {
  report: PublishedSurveyReport;
}) {
  const results = completeSurveyResults(report);
  return (
    <section aria-labelledby="course-survey-heading" className="space-y-4">
      <h2 id="course-survey-heading" className="sr-only">
        Student experience survey
      </h2>
      {results.surveys.length > 0 && (
        <>
          <ReviewSummaryCards results={results} />
          <Card>
            <CardContent className="pt-1">
              <ReviewTrendChart results={results} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>By semester</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="border-t border-border/60 pt-5">
              <ReviewHeatmap results={results} />
            </CardContent>
          </Card>
        </>
      )}
      {results.surveys.length !== report.surveys.length && (
        <p className="text-sm text-muted-foreground">
          Charts include {results.surveys.length} of {report.surveys.length}{" "}
          periods with complete results. All reported values are listed below.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-3 text-left font-medium">
            Reported survey values
          </caption>
          <thead>
            <tr>
              {[
                "Period",
                "Enrolments",
                "Respondents",
                "Response rate (%)",
                ...SURVEY_THEMES.map((theme) => `${theme.shortLabel} (%)`),
              ].map((label) => (
                <th className="p-2" scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.surveys.map((item) => (
              <tr key={`${item.year}-${item.session}`}>
                {[
                  `Semester ${item.session === "sem_1" ? 1 : 2} ${item.year}`,
                  item.enrolments,
                  item.respondents,
                  item.responseRatePercent,
                  ...SURVEY_THEMES.map(
                    (theme) => item.agreementPercent[theme.key],
                  ),
                ].map((value, index) => (
                  <td className="p-2" key={index}>
                    {value ?? "Unavailable"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.notes.map((note, index) => (
        <p className="text-xs text-muted-foreground" key={index}>
          {note}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        Intervals are approximate, using rounded agreement percentages and total
        survey respondents. Question response counts may differ.
      </p>
      <p className="px-1 text-xs text-muted-foreground">
        Source:{" "}
        <a
          className="underline"
          href={report.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {report.sourceName}
        </a>
        .{" "}
        {report.reportRunAt
          ? `Report generated ${report.reportRunAt.slice(0, 10)}.`
          : ""}
      </p>
    </section>
  );
}
