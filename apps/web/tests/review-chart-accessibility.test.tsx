import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ReviewResponseColumns } from "@/ui/courses/reviews/review-response-columns";
import { ReviewThemeColumns } from "@/ui/courses/reviews/review-theme-columns";
import { ReviewOverallSparkline } from "@/ui/courses/reviews/review-overall-sparkline";
import {
  themeSummaries,
  type CourseSurveyResults,
} from "@/lib/course-surveys/survey-results";

const results: CourseSurveyResults = {
  courseCode: "COMP1100",
  sourceName: "SELT",
  surveys: [
    {
      year: 2026,
      session: "sem_1",
      enrolments: 100,
      respondents: 40,
      agreementPercent: {
        teaching_and_learning_activities: 80,
        workload: 70,
        feedback: 75,
        analytical_development: 85,
        overall_learning_experience: 90,
      },
    },
  ],
};

test("exposes response columns as a named image", () => {
  render(<ReviewResponseColumns results={results} />);
  expect(
    screen.getByRole("img", { name: "Semester 1 2026: 40 responses" }),
  ).toBeInTheDocument();
});

test("exposes theme columns as a named image", () => {
  render(
    <ReviewThemeColumns
      summaries={themeSummaries(results)}
      highlightKey="workload"
    />,
  );
  expect(
    screen.getByRole("img", {
      name: "Teaching: 80%, Workload: 70%, Feedback: 75%, Analytical: 85%, Overall: 90%",
    }),
  ).toBeInTheDocument();
});

test("exposes the overall sparkline as a named image", () => {
  render(<ReviewOverallSparkline results={results} />);
  expect(
    screen.getByRole("img", { name: "Semester 1 2026: 90%" }),
  ).toBeInTheDocument();
});
