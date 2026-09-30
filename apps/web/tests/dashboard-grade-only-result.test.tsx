import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { academicTermPoints } from "@/lib/coursemap/academic-metrics";
import { GpaMetric } from "@/ui/dashboard/gpa-metric";
import { AverageMarkMetric } from "@/ui/dashboard/average-mark-metric";

test("a grade-only failed term appears as GPA zero without an invented average mark", () => {
  const points = academicTermPoints({
    attempts: [
      {
        id: "fail",
        courseCode: "COMP1100",
        termId: "2025-s1",
        status: "failed",
        resultCode: "NCN",
        unitsAttempted: 12,
        unitsEarned: 0,
      },
    ],
    courses: [],
    terms: [
      {
        id: "2025-s1",
        year: 2025,
        name: "First Semester",
        shortName: "Semester 1",
        dates: "",
      },
    ],
  });
  render(
    <>
      <GpaMetric gpa={0} points={points} />
      <AverageMarkMetric points={points} />
    </>,
  );
  expect(
    screen.getByRole("img", { name: "GPA 0.0 of 7 in S1 '25" }),
  ).toBeInTheDocument();
  expect(screen.getByText("0.0")).toBeInTheDocument();
  expect(screen.getByText("No marks yet")).toBeInTheDocument();
});
