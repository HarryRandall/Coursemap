import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { RequisiteRuleSummary } from "@/ui/courses/requisite-summary";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "automatic" as const,
  sourceText: "",
};

function renderSummary(expression: CourseRuleExpression) {
  render(
    <TooltipProvider>
      <RequisiteRuleSummary
        academicYear={2026}
        expression={expression}
        availableCourseCodes={new Set(["COMP1600"])}
      />
    </TooltipProvider>,
  );
}

test("reads the whole tree, including the kinds the narrow summary drops", () => {
  renderSummary({
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [
      { ...base, kind: "subject_units", subject: "COMP", units: 24 },
      { ...base, kind: "year_standing", minimumYear: 3 },
      {
        kind: "group",
        operator: "any_of",
        minimumCount: null,
        conditions: [
          { ...base, kind: "subject_units", subject: "MATH", units: 6 },
          {
            ...base,
            kind: "course",
            code: "COMP1600",
            minimumMark: null,
            requirementMode: "completed",
          },
        ],
      },
    ],
  });
  expect(screen.getByText("Complete all of the following")).toBeInTheDocument();
  expect(screen.getByText("Complete one of the following")).toBeInTheDocument();
  expect(screen.getByText("Year standing")).toBeInTheDocument();
  expect(screen.getByText("At least year 3 standing")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "COMP1600" })).toHaveAttribute(
    "href",
    "/courses/COMP1600?year=2026",
  );
});

test("an at_least group says how many of its options must be met", () => {
  renderSummary({
    kind: "group",
    operator: "at_least",
    minimumCount: 2,
    conditions: [
      { ...base, kind: "subject_units", subject: "COMP", units: 6 },
      { ...base, kind: "subject_units", subject: "MATH", units: 6 },
      { ...base, kind: "subject_units", subject: "STAT", units: 6 },
    ],
  });
  expect(
    screen.getByText("Complete at least 2 of the following"),
  ).toBeInTheDocument();
});

test("an incompatibility is flagged rather than read as something to complete", () => {
  renderSummary({ ...base, kind: "incompatible", code: "COMP6466" });
  expect(screen.getByText("Cannot be counted together")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Incompatible", { selector: "svg" }),
  ).toBeInTheDocument();
});
