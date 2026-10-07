import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import { RequisiteDiagram } from "@/ui/courses/requisite-diagram";
import { sampleStudent } from "@/lib/coursemap/requisite-samples";
import { stat2001Requisites } from "./fixtures/stat2001-requisites";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "automatic" as const,
  sourceText: "",
};
const course = (code: string): CourseRuleExpression => ({
  ...base,
  kind: "course",
  code,
  minimumMark: null,
  requirementMode: "completed",
});

/** 72 units AND any 2 of three courses, with a permission and an exclusion. */
const rule: CourseRuleExpression = {
  kind: "group",
  operator: "all_of",
  minimumCount: null,
  conditions: [
    { ...base, kind: "units_total", subject: null, units: 72 },
    {
      kind: "group",
      operator: "at_least",
      minimumCount: 2,
      conditions: [course("COMP2100"), course("COMP2120"), course("COMP2300")],
    },
    { ...base, kind: "permission", text: "Apply to the School of Computing." },
    { ...base, kind: "incompatible", code: "COMP3530" },
  ],
};

function renderDiagram(
  props: Partial<Parameters<typeof RequisiteDiagram>[0]> = {},
) {
  return render(
    <RequisiteDiagram
      academicYear={2026}
      availableCourseCodes={
        new Set(["COMP2100", "COMP2120", "COMP2300", "COMP4500"])
      }
      code="COMP3500"
      expression={rule}
      hasPrerequisiteWording
      student={null}
      unlocks={[
        { code: "COMP4500", isAvailable: true },
        { code: "COMP4550", isAvailable: false },
      ]}
      unlocksAreKnown
      {...props}
    />,
  );
}

test("each requirement is its own box and the group says how many it needs", () => {
  renderDiagram();
  expect(screen.getByText("Requires all of")).toBeInTheDocument();
  expect(screen.getByText("72 units in total")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Any 2 of 3" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /COMP2120/u })).toHaveAttribute(
    "href",
    "/courses/2026/comp2120",
  );
});

test("lines merge before the course, so it gets exactly one arrowhead", () => {
  renderDiagram();
  const svg = screen.getByTestId("requisite-diagram").querySelector("svg")!;
  const heads = [...svg.querySelectorAll("path")].filter((path) =>
    path.getAttribute("d")?.endsWith("z"),
  );
  // One into the course and one into each unlocked course.
  expect(heads).toHaveLength(3);
  expect(svg.querySelectorAll("circle")).toHaveLength(1);
});

test("a permission is a badge on the course, not a prerequisite box", () => {
  renderDiagram();
  expect(screen.getByText("Permission needed")).toBeInTheDocument();
  expect(
    screen.queryByText("Apply to the School of Computing."),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/cannot be counted with COMP3530/u),
  ).toBeInTheDocument();
});

test("unlocked courses without published details still link, marked unavailable", () => {
  renderDiagram();
  expect(screen.getByRole("link", { name: /COMP4500/u })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /COMP4550/u })).toHaveAttribute(
    "title",
    "COMP4550: course details unavailable",
  );
});

test("completed requirements say so in words as well as colour", () => {
  const student: StudentRecord = {
    completed: new Map([["COMP2100", { units: 6, mark: null }]]),
    enrolled: new Set(),
    programmeCodes: [],
    wam: null,
    gpa: null,
    studyYear: null,
  };
  renderDiagram({ student });
  expect(
    screen.getByRole("link", { name: /COMP2100.*Done/u }),
  ).toBeInTheDocument();
});

test.each([true, false])(
  "keeps an isolated course in the graph when follow-on courses are known: %s",
  (unlocksAreKnown) => {
    renderDiagram({
      expression: null,
      unlocks: [],
      hasPrerequisiteWording: false,
      unlocksAreKnown,
    });
    expect(screen.getByTestId("requisite-diagram")).toContainElement(
      screen.getByText("COMP3500"),
    );
    expect(screen.getByText("This course")).toBeVisible();
    expect(
      screen.queryByText(
        /has no prerequisites|not known until|No course prerequisites/,
      ),
    ).not.toBeInTheDocument();
  },
);

test("with nothing known to follow, the unlocks column is left out", () => {
  renderDiagram({ unlocks: [], unlocksAreKnown: false });
  expect(screen.queryByText("Unlocks")).not.toBeInTheDocument();
  expect(screen.queryByText("Not known yet")).not.toBeInTheDocument();
  expect(screen.getByText("This course")).toBeInTheDocument();
});

test("partway marks the completed alternative and labels concurrent enrolment", () => {
  renderDiagram({
    expression: stat2001Requisites,
    student: sampleStudent(stat2001Requisites, "partway"),
    availableCourseCodes: new Set(),
  });
  expect(
    screen.getByRole("link", { name: /STAT1003.*Done/u }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Done")).toHaveLength(1);
  expect(
    screen.getByRole("link", { name: /MATH1014.*Completed or concurrent/u }),
  ).toBeInTheDocument();
});

test("caps unlocked course cards at seven and links the full list in the same year", () => {
  renderDiagram({
    academicYear: 2027,
    unlocks: Array.from({ length: 12 }, (_, index) => ({
      code: `COMP${4500 + index}`,
      isAvailable: true,
    })),
  });
  expect(screen.getByRole("link", { name: /COMP4506/u })).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /COMP4507/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "See all 12 courses listing COMP3500 as a prerequisite in 2027",
    }),
  ).toHaveAttribute("href", "/courses?year=2027&prerequisite=COMP3500");
  expect(screen.getByText("+ 5 more")).toBeInTheDocument();
  const svg = screen.getByTestId("requisite-diagram").querySelector("svg")!;
  expect(
    [...svg.querySelectorAll("path")].filter((path) =>
      path.getAttribute("d")?.endsWith("z"),
    ),
  ).toHaveLength(9);
});

test.each([0, 1, 7])(
  "does not show an overflow link for %s unlocked courses",
  (count) => {
    renderDiagram({
      unlocks: Array.from({ length: count }, (_, index) => ({
        code: `COMP${4500 + index}`,
        isAvailable: true,
      })),
    });
    expect(
      screen.queryByRole("link", { name: /See all/u }),
    ).not.toBeInTheDocument();
  },
);
