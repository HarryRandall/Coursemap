import { expect, test } from "vitest";
import { coursePlanStatus, evaluateCoursePrerequisites } from "@/lib/planner";
import type {
  CourseRuleExpression,
  CourseRequisiteRule,
} from "@/lib/coursemap/course-types";
import type { Attempt, Course } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const target: Attempt = {
  id: "target",
  courseCode: "COMP1110",
  academicYear: 2026,
  termId: "2026-s2",
  status: "planned",
};
const base = {
  ...courses.find((course) => course.code === "COMP1110")!,
  prerequisiteRule: null,
  prerequisiteText: "",
  prerequisiteCodes: [],
  incompatibilities: [],
  permissionText: undefined,
  sessions: ["Semester 2"],
};
const metadata = {
  hardness: "hard",
  reviewState: "verified",
  confidence: 1,
  sourceText: "",
} as const;
function rule(expression: CourseRuleExpression): CourseRequisiteRule {
  return { ...metadata, expression: null, relationalExpression: expression };
}
function status(
  course: Course = base,
  attempts: Attempt[] = [target],
  attempt = target,
) {
  return coursePlanStatus(attempt, attempts, { courses: [course], terms });
}

test("completion and credit evidence keep the done lifecycle without future planning issues", () => {
  expect(
    status(base, [target], {
      ...target,
      status: "completed",
      resultCode: "CRS",
    }),
  ).toEqual({ lifecycle: "done", issues: [] });
  expect(status()).toEqual({ lifecycle: "planned", issues: [] });
});

test("verified prerequisites and incompatibilities name each hard block", () => {
  const course = {
    ...base,
    prerequisiteRule: rule({
      ...metadata,
      kind: "course",
      code: "FINM2001",
      minimumMark: null,
      requirementMode: "completed",
    }),
    incompatibilityRule: rule({
      ...metadata,
      kind: "incompatible",
      code: "ECON1100",
    }),
    sessions: ["Semester 1"],
  };
  const conflict: Attempt = {
    ...target,
    id: "conflict",
    courseCode: "ECON1100",
    termId: "2026-s1",
  };
  expect(status(course, [target, conflict]).issues).toEqual([
    { code: "prerequisite", severity: "hard", detail: "Needs FINM2001 first" },
    {
      code: "incompatibility",
      severity: "hard",
      detail: "Can't be taken with ECON1100",
    },
    { code: "offering", severity: "hard", detail: "Not offered in Semester 2" },
  ]);
});

test("all required clauses retain permission and unverified wording alongside a hard block", () => {
  const course = {
    ...base,
    prerequisiteRule: rule({
      kind: "group",
      operator: "all_of",
      minimumCount: null,
      conditions: [
        {
          ...metadata,
          kind: "course",
          code: "FINM2001",
          minimumMark: null,
          requirementMode: "completed",
        },
        { ...metadata, kind: "permission", text: "Convener permission" },
        {
          ...metadata,
          kind: "other",
          text: "Additional requirement",
          reviewState: "review",
        },
      ],
    }),
    sessions: [],
  };
  const issues = status(course).issues;
  expect(issues.map((issue) => [issue.code, issue.severity])).toEqual([
    ["prerequisite", "hard"],
    ["permission", "soft"],
    ["unverified", "soft"],
    ["offering", "soft"],
  ]);
  expect(issues[2].detail).toBe(
    "Coursemap couldn't check this requirement: read it on the course page",
  );
});

test("a satisfied alternative creates no issue for the other option", () => {
  const course = {
    ...base,
    prerequisiteRule: rule({
      kind: "group",
      operator: "any_of",
      minimumCount: null,
      conditions: [
        {
          ...metadata,
          kind: "course",
          code: "FINM2001",
          minimumMark: null,
          requirementMode: "completed",
        },
        { ...metadata, kind: "permission", text: "Permission" },
      ],
    }),
  };
  expect(
    status(course, [target], { ...target, permissionApproved: true }).issues,
  ).toEqual([]);
});

test("rules flagged for review stay soft and overload is retained independently", () => {
  const overloaded = Array.from({ length: 5 }, (_, index) => ({
    ...target,
    id: String(index),
    unitsAttempted: 6,
  }));
  const course = {
    ...base,
    prerequisiteRule: {
      ...rule({ ...metadata, kind: "permission", text: "Permission" }),
      reviewState: "review" as const,
    },
  };
  expect(
    status(course, overloaded).issues.map((issue) => [
      issue.code,
      issue.severity,
    ]),
  ).toEqual([
    ["unverified", "soft"],
    ["overload", "soft"],
  ]);
});

test("a parsed rule is checked like a verified one", () => {
  const course = {
    ...base,
    prerequisiteRule: {
      ...rule({
        ...metadata,
        kind: "course",
        code: "FINM2001",
        minimumMark: null,
        requirementMode: "completed",
        reviewState: "automatic",
      }),
      reviewState: "automatic" as const,
    },
  };
  expect(status(course).issues).toEqual([
    {
      code: "prerequisite",
      severity: "hard",
      detail: "Needs FINM2001 first",
    },
  ]);
});

test("preview uses an explicit whole-plan context while a scheduled course needs earlier work", () => {
  const course = {
    ...base,
    prerequisiteRule: rule({
      ...metadata,
      kind: "course",
      code: "FINM2001",
      minimumMark: null,
      requirementMode: "completed",
    }),
  };
  const later: Attempt = {
    ...target,
    id: "later",
    courseCode: "FINM2001",
    termId: "2028-s2",
  };
  const catalogue = { courses: [course], terms };
  expect(evaluateCoursePrerequisites(target, [later], catalogue).state).toBe(
    "unsatisfied",
  );
  expect(
    evaluateCoursePrerequisites({ ...target, termId: "" }, [later], {
      ...catalogue,
      evaluationContext: "whole-plan",
    }).state,
  ).toBe("satisfied");
});
