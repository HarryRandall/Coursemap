import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  completeSurveyResults,
  type PublishedSurveyReport,
} from "../lib/course-surveys/report-model";
import { SURVEY_THEMES } from "../lib/course-surveys/survey-results";
import { CourseSurveyPanel } from "../ui/courses/reviews/course-survey-panel";

vi.mock("@/ui/courses/reviews/review-trend-chart", () => ({
  ReviewTrendChart: () => <div>Trend chart</div>,
}));
vi.mock("@/ui/courses/reviews/review-summary-cards", () => ({
  ReviewSummaryCards: () => <div>Summary cards</div>,
}));
vi.mock("@/ui/courses/reviews/review-heatmap", () => ({
  ReviewHeatmap: () => <div>Heatmap</div>,
}));

function report(): PublishedSurveyReport {
  const agreementPercent = Object.fromEntries(
    SURVEY_THEMES.map((theme) => [theme.key, 75]),
  ) as PublishedSurveyReport["surveys"][number]["agreementPercent"];
  return {
    courseCode: "TEST1234",
    sourceName: "ANU SELT",
    sourceUrl: "https://unistats.anu.edu.au/report.pdf",
    reportRunAt: null,
    notes: [],
    surveys: [
      {
        year: 2025,
        session: "sem_1",
        enrolments: 100,
        respondents: 20,
        responseRatePercent: 20,
        agreementPercent,
      },
      {
        year: 2025,
        session: "sem_2",
        enrolments: 100,
        respondents: null,
        responseRatePercent: null,
        agreementPercent: { ...agreementPercent, feedback: null },
      },
    ],
  };
}

describe("published survey values", () => {
  it("keeps incomplete periods out of charts without converting missing values to zero", () => {
    const source = report();
    expect(completeSurveyResults(source).surveys).toHaveLength(1);
    expect(source.surveys[1].agreementPercent.feedback).toBeNull();
  });
  it("shows every period and its reported response rate in the table", () => {
    render(<CourseSurveyPanel report={report()} />);
    const table = screen.getByRole("table", { name: "Reported survey values" });
    expect(within(table).getByText("Semester 2 2025")).toBeVisible();
    expect(within(table).getAllByText("Unavailable")).toHaveLength(3);
    expect(screen.getByText(/Charts include 1 of 2 periods/)).toBeVisible();
    expect(screen.getByRole("link", { name: "ANU SELT" })).toHaveAttribute(
      "href",
      "https://unistats.anu.edu.au/report.pdf",
    );
  });
  it("renders the table when no periods can be charted", () => {
    const source = report();
    source.surveys = [source.surveys[1]];
    render(<CourseSurveyPanel report={source} />);
    expect(screen.queryByText("Trend chart")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeVisible();
  });
});
