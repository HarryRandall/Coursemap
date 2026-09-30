import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type { Attempt } from "@/lib/coursemap/types";
import type { EnrolmentMode } from "@/lib/academic/enrolment-mode";
import { CourseDialog } from "@/ui/overlays/course-dialog";
import { courses, terms } from "./fixtures/catalogue";

const fixture = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  commencementYear: 2024,
  enrolmentMode: null as EnrolmentMode | null,
  degreeCode: "BCOMP",
  togglePermission: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      attempts: fixture.attempts,
      profile: {
        degreeCode: fixture.degreeCode,
        commencementYear: fixture.commencementYear,
        enrolmentMode: fixture.enrolmentMode,
      },
    },
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

test("college eligibility follows the selected programme and stays unknown without published affiliation", async () => {
  const college = "ANU College of Arts and Social Sciences";
  const scoped = {
    ...catalogue,
    programmeColleges: [
      { code: "BTEST", college },
      { code: "BCOMP", college: "Different college" },
    ],
    courses: catalogue.courses.map((course) =>
      course.code === "COMP1110"
        ? {
            ...course,
            incompatibilityRule: null,
            prerequisiteRule: {
              ...base,
              expression: null,
              relationalExpression: {
                ...base,
                kind: "college_enrolment" as const,
                college,
              },
            },
          }
        : course,
    ),
  };
  fixture.attempts = [
    {
      id: "target",
      courseCode: "COMP1110",
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned",
      permissionApproved: true,
    },
  ];
  fixture.degreeCode = "BCOMP";
  const view = render(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Blocked", { exact: true })).toBeVisible();
  await userEvent
    .setup()
    .click(screen.getByRole("tab", { name: "Requisites" }));
  expect(
    screen.getByText("Your programme is offered by a different college"),
  ).toBeVisible();
  fixture.degreeCode = "BTEST";
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Planned", { exact: true })).toBeVisible();
  expect(
    screen.getByText(`Your programme is offered by ${college}`),
  ).toBeVisible();
  fixture.degreeCode = "UNKNOWN";
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Review needed", { exact: true })).toBeVisible();
  expect(
    screen.getByText(
      "Programme college information is missing or conflicting.",
    ),
  ).toBeVisible();
  fixture.degreeCode = "BCOMP";
});

test("degree mode changes preserve the conditional permission path in the student dialog", async () => {
  const mode = {
    ...base,
    kind: "enrolment_mode" as const,
    enrolmentMode: "flexible_double_degree" as const,
    matchesEnrolmentMode: false,
  };
  const rule: CourseRuleExpression = {
    kind: "group",
    operator: "any_of",
    minimumCount: null,
    conditions: [
      mode,
      {
        kind: "group",
        operator: "all_of",
        minimumCount: null,
        conditions: [
          { ...mode, matchesEnrolmentMode: true },
          {
            ...base,
            kind: "permission",
            text: "Permission from info.cbe@anu.edu.au",
          },
        ],
      },
    ],
  };
  const scoped = {
    ...catalogue,
    courses: catalogue.courses.map((course) =>
      course.code === "COMP1110"
        ? {
            ...course,
            incompatibilityRule: null,
            prerequisiteRule: {
              ...base,
              expression: null,
              relationalExpression: rule,
            },
          }
        : course,
    ),
  };
  fixture.attempts = [
    {
      id: "target",
      courseCode: "COMP1110",
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned",
      permissionApproved: false,
    },
  ];
  fixture.enrolmentMode = "single_degree";
  const view = render(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Planned", { exact: true })).toBeVisible();
  fixture.enrolmentMode = "flexible_double_degree";
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Approval needed", { exact: true })).toBeVisible();
  fixture.attempts[0].permissionApproved = true;
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Planned", { exact: true })).toBeVisible();
  fixture.enrolmentMode = null;
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Review needed", { exact: true })).toBeVisible();
});

test("the plan dialog evaluates a cohort waiver from the saved profile year", async () => {
  const user = userEvent.setup();
  const cohort: CourseRuleExpression = {
    kind: "group",
    operator: "any_of",
    minimumCount: null,
    conditions: [
      {
        ...base,
        kind: "course",
        code: "COMP1100",
        minimumMark: null,
        requirementMode: "completed",
      },
      {
        kind: "group",
        operator: "all_of",
        minimumCount: null,
        conditions: [
          {
            ...base,
            kind: "commencement_year",
            minimumCommencementYear: null,
            maximumCommencementYear: 2020,
          },
          { ...base, kind: "permission", text: "Research School permission" },
        ],
      },
    ],
  };
  const scoped = {
    ...catalogue,
    courses: catalogue.courses.map((course) =>
      course.code === "COMP1110"
        ? {
            ...course,
            incompatibilityRule: null,
            prerequisiteRule: {
              ...base,
              expression: null,
              relationalExpression: cohort,
            },
          }
        : course,
    ),
  };
  fixture.attempts = [
    {
      id: "target",
      courseCode: "COMP1110",
      termId: "2026-s2",
      academicYear: 2026,
      status: "planned",
      permissionApproved: true,
    },
  ];
  fixture.commencementYear = 2024;
  const view = render(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Blocked")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Requisites" }));
  expect(screen.getByText("You commenced in 2024")).toBeVisible();
  fixture.commencementYear = 2020;
  view.rerender(
    <CourseDialog attemptId="target" catalogue={scoped} onClose={vi.fn()} />,
  );
  expect(screen.queryByText("Approval needed")).not.toBeInTheDocument();
  expect(screen.getByText("You commenced in 2020")).toBeVisible();
});
