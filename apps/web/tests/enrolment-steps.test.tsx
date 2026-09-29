import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import { EnrolmentSteps } from "@/ui/courses/enrolment-steps";
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
    { ...base, kind: "wam", minimumWam: 70 },
    { ...base, kind: "permission", text: "Apply to the School of Computing." },
    { ...base, kind: "incompatible", code: "COMP3530" },
  ],
};

const student: StudentRecord = {
  completed: new Map([
    ["COMP2300", { units: 6, mark: 75 }],
    ["COMP1100", { units: 54, mark: 70 }],
  ]),
  enrolled: new Set(),
  programmeCodes: [],
  wam: 72.5,
  gpa: 5.8,
  studyYear: 3,
};

test("mixed alternatives state their actions and preserve concurrent enrolment", () => {
  render(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set(["STAT1003"])}
      expression={stat2001Requisites}
      student={sampleStudent(stat2001Requisites, "partway")}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Complete STAT1003" }),
  ).toHaveAttribute("href", "/courses/2026/stat1003");
  expect(screen.getByText("Be enrolled in BADAN")).toBeInTheDocument();
  expect(
    screen.getByText("Complete MATH1014, or take it in the same semester"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Option [A-Z]/u)).not.toBeInTheDocument();
  expect(screen.getByText("1 of 2 met")).toBeInTheDocument();
  expect(screen.getAllByText("You meet this")).toHaveLength(1);
});

function renderSteps(value: StudentRecord | null) {
  return render(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set(["COMP2100", "COMP2120", "COMP2300"])}
      expression={rule}
      student={value}
    />,
  );
}

test("every part of the rule is a step, with permission and exclusions last", () => {
  renderSteps(null);
  const steps = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(steps.map((step) => step.querySelector("p")?.textContent)).toEqual([
    "Complete 72 units",
    "Complete any 2 of these courses",
    "Have a WAM of 70 or more",
    "Get permission to enrol",
    "You can't take this if you've completed COMP3530",
  ]);
  expect(screen.getByText("Sign in to see your progress")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("a signed-in student sees progress towards each step", () => {
  renderSteps(student);
  expect(
    screen.getByRole("progressbar", { name: "Units completed" }),
  ).toHaveAttribute("aria-valuenow", "60");
  expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
  expect(screen.getByText("72.5")).toBeInTheDocument();
  expect(
    screen.getByText("You haven't completed COMP3530"),
  ).toBeInTheDocument();
  // Units, courses and the exclusion count; the permission cannot be checked.
  expect(screen.getByText("2 of 4 met")).toBeInTheDocument();
});

test("completed courses come first in a choice", () => {
  renderSteps(student);
  const chips = screen
    .getAllByRole("link")
    .map((link) => link.textContent?.replace(/\s*\(done\)/u, ""));
  expect(chips).toEqual(["COMP2300", "COMP2100", "COMP2120"]);
});

test("a unit requirement links to the courses that count towards it", () => {
  render(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set()}
      expression={{
        kind: "group",
        operator: "all_of",
        minimumCount: null,
        conditions: [
          { ...base, kind: "subject_units", subject: "COMP", units: 24 },
          {
            ...base,
            kind: "level_units",
            minimumLevel: 2000,
            maximumLevel: null,
            subject: "COMP",
            units: 12,
          },
          { ...base, kind: "tagged_units", tag: "Science", units: 6 },
        ],
      }}
      student={null}
    />,
  );
  expect(
    screen.getByRole("link", { name: /24 units of COMP courses/u }),
  ).toHaveAttribute("href", "/courses?year=2026&subject=COMP");
  expect(
    screen.getByRole("link", { name: /2000-level or higher COMP/u }),
  ).toHaveAttribute("href", "/courses?year=2026&level=2%2B&subject=COMP");
  expect(screen.getByRole("link", { name: /tagged Science/u })).toHaveAttribute(
    "href",
    "/courses?year=2026&tag=Science",
  );
});

test("subject course counts display course progress and link to their subject", () => {
  render(
    <EnrolmentSteps
      academicYear={2024}
      availableCourseCodes={new Set()}
      expression={{
        ...base,
        kind: "subject_courses",
        subject: "STAT",
        minimumCount: 2,
      }}
      student={{
        ...student,
        completed: new Map([["STAT1003", { units: 12, mark: 75 }]]),
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: /Complete 2 STAT courses/u }),
  ).toHaveAttribute("href", "/courses?year=2024&subject=STAT");
  expect(screen.getByText("1 of 2 completed STAT courses")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("concurrent exclusions show enrolment restrictions without banning prior completion", () => {
  const { rerender } = render(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set()}
      expression={{
        ...base,
        kind: "incompatible_concurrent",
        code: "COMP1100",
      }}
      student={student}
    />,
  );
  expect(
    screen.getByText("You can't take this in the same semester as COMP1100"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("You aren't enrolled in COMP1100"),
  ).toBeInTheDocument();
  expect(screen.getByText("1 of 1 met")).toBeInTheDocument();
  expect(
    screen.queryByText("You can't take this if you've completed COMP1100"),
  ).not.toBeInTheDocument();
  rerender(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set()}
      expression={{
        ...base,
        hardness: "advisory",
        kind: "incompatible_concurrent",
        code: "COMP1100",
        sourceText: "Avoid concurrently taking COMP1100.",
      }}
      student={{ ...student, enrolled: new Set(["COMP1100"]) }}
    />,
  );
  expect(screen.getByText("Recommended")).toBeInTheDocument();
  expect(
    screen.getByText("Consider taking COMP1100 in a different semester."),
  ).toBeInTheDocument();
  expect(screen.queryByText("0 of 0 met")).not.toBeInTheDocument();
});

test("a nested permission alternative shows its authority alongside the exclusion pathway", () => {
  const text =
    "If you completed COMP1100, obtain permission from the course convener.";
  render(
    <EnrolmentSteps
      academicYear={2026}
      availableCourseCodes={new Set()}
      student={null}
      expression={{
        kind: "group",
        operator: "any_of",
        minimumCount: null,
        conditions: [
          { ...base, kind: "incompatible", code: "COMP1100" },
          { ...base, kind: "permission", text },
        ],
      }}
    />,
  );
  expect(screen.getByText("Meet one of these")).toBeVisible();
  expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByText("Get permission to enrol")).toBeVisible();
});
