import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { PrereqGraph } from "@/ui/prereq-graph";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "automatic" as const,
  sourceText: "",
};

/** COMP3600 in the local catalogue: 24 units of COMP AND (6 units of MATH OR COMP1600). */
const comp3600Rule: CourseRuleExpression = {
  kind: "group",
  operator: "all_of",
  minimumCount: null,
  conditions: [
    { ...base, kind: "subject_units", subject: "COMP", units: 24 },
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
};

function renderGraph(props: Partial<Parameters<typeof PrereqGraph>[0]> = {}) {
  return render(
    <TooltipProvider>
      <PrereqGraph
        academicYear={2026}
        availableCourseCodes={new Set(["COMP3600", "COMP1600"])}
        code="COMP3600"
        expression={comp3600Rule}
        hasPrerequisiteWording
        prerequisiteEdges={[]}
        showStudentState={false}
        statusByCode={new Map()}
        unlocksAreKnown
        {...props}
      />
    </TooltipProvider>,
  );
}

test("every condition of the rule is drawn, including the unit requirements", () => {
  renderGraph();
  expect(screen.getByText("COMP courses")).toBeInTheDocument();
  expect(screen.getByText("COMP coded courses · At least 24 units"));
  expect(screen.getByText("MATH courses")).toBeInTheDocument();
  expect(screen.getByText("MATH coded courses · At least 6 units"));
  expect(screen.getByRole("link", { name: /COMP1600/u })).toHaveAttribute(
    "href",
    "/courses/COMP1600?year=2026",
  );
});

test("alternatives are marked as a choice rather than listed as separate rules", () => {
  renderGraph();
  expect(screen.getByText("Choose one")).toBeInTheDocument();
  // The 24 units of COMP sit outside the choice, so it must not swallow them.
  expect(screen.queryByText("All of these")).not.toBeInTheDocument();
});

test("a nested all_of inside a choice keeps its own group node", () => {
  renderGraph({
    expression: {
      kind: "group",
      operator: "any_of",
      minimumCount: null,
      conditions: [
        {
          ...base,
          kind: "course",
          code: "COMP1600",
          minimumMark: null,
          requirementMode: "completed",
        },
        {
          kind: "group",
          operator: "all_of",
          minimumCount: null,
          conditions: [
            { ...base, kind: "subject_units", subject: "MATH", units: 6 },
            { ...base, kind: "units_total", subject: null, units: 24 },
          ],
        },
      ],
    },
  });
  expect(screen.getByText("Choose one")).toBeInTheDocument();
  expect(screen.getByText("All of these")).toBeInTheDocument();
});

test("an incompatibility is stated as an exclusion, never as a prerequisite", () => {
  renderGraph({
    expression: {
      kind: "group",
      operator: "all_of",
      minimumCount: null,
      conditions: [
        {
          ...base,
          kind: "course",
          code: "COMP1600",
          minimumMark: null,
          requirementMode: "completed",
        },
        { ...base, kind: "incompatible", code: "COMP6466" },
      ],
    },
  });
  expect(
    screen.queryByRole("link", { name: /COMP6466/u }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Not a prerequisite.*COMP6466/u)).toBeInTheDocument();
});

test("course state carries a word as well as a colour", () => {
  renderGraph({
    expression: {
      kind: "group",
      operator: "any_of",
      minimumCount: null,
      conditions: [
        {
          ...base,
          kind: "course",
          code: "COMP1600",
          minimumMark: null,
          requirementMode: "completed",
        },
        {
          ...base,
          kind: "course",
          code: "COMP1110",
          minimumMark: null,
          requirementMode: "completed",
        },
      ],
    },
    availableCourseCodes: new Set(["COMP3600", "COMP1600", "COMP1110"]),
    showStudentState: true,
    statusByCode: new Map([
      ["COMP1600", "completed"],
      ["COMP1110", "planned"],
    ] as const),
  });
  expect(
    within(screen.getByRole("link", { name: /COMP1600/u })).getByText(
      "Completed",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("link", { name: /COMP1110/u })).getByText(
      "Planned",
    ),
  ).toBeInTheDocument();
});

test("unlocks says it is unknown rather than implying nothing follows", () => {
  renderGraph({ unlocksAreKnown: false });
  expect(screen.getByText("Not known yet")).toBeInTheDocument();
  expect(
    screen.queryByText("No published course lists this one"),
  ).not.toBeInTheDocument();
});

test("a known and empty reverse lookup says so plainly", () => {
  renderGraph({ unlocksAreKnown: true });
  expect(
    screen.getByText("No published course lists this one"),
  ).toBeInTheDocument();
});

test("unlocked courses appear when the reverse lookup found some", () => {
  renderGraph({
    prerequisiteEdges: [
      {
        from: "COMP3600",
        to: "COMP4600",
        fromIsAvailable: true,
        toIsAvailable: true,
      },
    ],
  });
  expect(screen.getByRole("link", { name: /COMP4600/u })).toHaveAttribute(
    "href",
    "/courses/COMP4600?year=2026",
  );
});

test("without a reviewed rule the graph says where its codes came from", () => {
  renderGraph({
    expression: null,
    prerequisiteEdges: [
      {
        from: "COMP1600",
        to: "COMP3600",
        fromIsAvailable: true,
        toIsAvailable: true,
      },
    ],
  });
  expect(screen.getByRole("link", { name: /COMP1600/u })).toBeInTheDocument();
  expect(
    screen.getByText(/Drawn from the course codes found/u),
  ).toBeInTheDocument();
});

test("a course with no rule and no references still explains the gap", () => {
  renderGraph({ expression: null, hasPrerequisiteWording: false });
  expect(screen.getByText("No prerequisite listed")).toBeInTheDocument();
});

test("nodes in a column are stacked without overlapping", () => {
  renderGraph({ showStudentState: true });
  const placed = [
    ...screen.getByTestId("prereq-graph").querySelectorAll<HTMLElement>("*"),
  ]
    .filter((element) => element.style.left && element.style.top)
    .map((element) => ({
      left: Number.parseFloat(element.style.left),
      top: Number.parseFloat(element.style.top),
      bottom:
        Number.parseFloat(element.style.top) +
        Number.parseFloat(element.style.height),
    }));
  expect(placed.length).toBeGreaterThan(3);
  for (const column of new Set(placed.map((item) => item.left))) {
    const stacked = placed
      .filter((item) => item.left === column)
      .sort((left, right) => left.top - right.top);
    for (let index = 1; index < stacked.length; index += 1) {
      expect(stacked[index].top).toBeGreaterThanOrEqual(
        stacked[index - 1].bottom,
      );
    }
  }
});
