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
  // Each group says what the reader needs, not a pair of near-identical
  // "Complete ... of the following" headings.
  expect(screen.getByText("You need all of these")).toBeInTheDocument();
  expect(screen.getByText("You need one of these")).toBeInTheDocument();
  // A unit rule leads with the figure rather than burying it under a category.
  expect(screen.getByText("24 units of COMP courses")).toBeInTheDocument();
  expect(screen.getByText("At least year 3 standing")).toBeInTheDocument();
  // An alternative separates its options with "or", so it cannot read as a
  // list of things to complete.
  expect(screen.getByText("or")).toBeInTheDocument();
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
  expect(screen.getByText("You need at least 2 of these")).toBeInTheDocument();
});

test("an incompatibility is flagged rather than read as something to complete", () => {
  renderSummary({ ...base, kind: "incompatible", code: "COMP6466" });
  // The code is a link, so the sentence is split across elements.
  expect(screen.getByText(/Cannot be counted with/)).toBeInTheDocument();
  expect(
    screen.getByLabelText("Incompatible", { selector: "svg" }),
  ).toBeInTheDocument();
});
