import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { Attempt } from "@/lib/coursemap/types";
import { CourseDialog } from "@/ui/overlays/course-dialog";
import { courses, terms } from "./fixtures/catalogue";

const fixture = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  togglePermission: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { attempts: fixture.attempts, profile: { degreeCode: "BCOMP" } },
    updateAttempt: vi.fn(),
    removeAttempt: vi.fn(),
    togglePermission: fixture.togglePermission,
    notify: fixture.notify,
  }),
}));

const text =
  "If you previously completed COMP1100, obtain permission from the course convener.";
const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "verified" as const,
  sourceText: text,
};
const expression: CourseRuleExpression = {
  kind: "group",
  operator: "any_of",
  minimumCount: null,
  conditions: [
    { ...base, kind: "incompatible", code: "COMP1100" },
    { ...base, kind: "permission", text },
  ],
};
const catalogue: PlanCatalogue = {
  academicYear: 2026,
  terms,
  degrees: [],
  majors: [],
  structures: [],
  structureRequirements: [],
  programmeRequirementsImported: false,
  courses: courses.map((course) =>
    course.code === "COMP1110"
      ? {
          ...course,
          year: 2026,
          prerequisiteRule: null,
          prerequisiteCodes: [],
          prerequisiteText: "",
          permissionText: "",
          incompatibilityRule: {
            ...base,
            expression: null,
            relationalExpression: expression,
          },
        }
      : { ...course, year: 2026 },
  ),
};

test("students can record and remove approval for a conditional exclusion in the plan dialog", async () => {
  const user = userEvent.setup();
  const target: Attempt = {
    id: "target",
    courseCode: "COMP1110",
    termId: "2026-s2",
    academicYear: 2026,
    status: "planned",
    permissionApproved: false,
  };
  fixture.attempts = [
    {
      id: "prior",
      courseCode: "COMP1100",
      termId: "2026-s1",
      academicYear: 2026,
      status: "completed",
    },
    target,
  ];
  fixture.togglePermission.mockClear();
  const view = render(
    <CourseDialog attemptId="target" catalogue={catalogue} onClose={vi.fn()} />,
  );
  await user.click(screen.getByRole("tab", { name: "Requisites" }));
  await user.click(
    await screen.findByRole("button", { name: "Record approval" }),
  );
  expect(fixture.togglePermission).toHaveBeenCalledWith("target");
  expect(screen.getByText("Meet one of these")).toBeVisible();
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  fixture.attempts = [
    fixture.attempts[0]!,
    { ...target, permissionApproved: true },
  ];
  view.rerender(
    <CourseDialog attemptId="target" catalogue={catalogue} onClose={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: "Remove approval" }));
  expect(fixture.togglePermission).toHaveBeenCalledTimes(2);
  expect(fixture.notify).toHaveBeenLastCalledWith(
    "Permission approval removed",
  );
});
