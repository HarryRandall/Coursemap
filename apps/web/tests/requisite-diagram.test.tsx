import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import { RequisiteDiagram } from "@/ui/courses/requisite-diagram";

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

test("unlocked courses without published details are not links", () => {
  renderDiagram();
  expect(screen.getByRole("link", { name: /COMP4500/u })).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /COMP4550/u }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByTitle("COMP4550: course details unavailable"),
  ).toBeInTheDocument();
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

test("a course with nothing on either side explains the gap", () => {
  renderDiagram({
    expression: null,
    unlocks: [],
    hasPrerequisiteWording: false,
  });
  expect(
    screen.getByText(
      "COMP3500 has no prerequisites, and no published course lists it as one.",
    ),
  ).toBeInTheDocument();
});

test("with nothing known to follow, the unlocks column is left out", () => {
  renderDiagram({ unlocks: [], unlocksAreKnown: false });
  expect(screen.queryByText("Unlocks")).not.toBeInTheDocument();
  expect(screen.queryByText("Not known yet")).not.toBeInTheDocument();
  expect(screen.getByText("This course")).toBeInTheDocument();
});
