import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import { EnrolmentSteps } from "@/ui/courses/enrolment-steps";

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
