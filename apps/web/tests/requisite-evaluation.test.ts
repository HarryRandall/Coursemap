import { expect, test } from "vitest";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  studentRecord,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "automatic" as const,
  sourceText: "",
};

const course = (
  code: string,
  extra: Partial<{
    minimumMark: number | null;
    requirementMode: "completed" | "completed_or_concurrent";
  }> = {},
): CourseRuleExpression => ({
  ...base,
  kind: "course",
  code,
  minimumMark: null,
  requirementMode: "completed",
  ...extra,
});

const student: StudentRecord = {
  completed: new Map([
    ["COMP1100", { units: 6, mark: 72 }],
    ["COMP2100", { units: 6, mark: 58 }],
    ["MATH1005", { units: 6, mark: null }],
  ]),
  enrolled: new Set(["COMP2310"]),
  programmeCodes: ["AACOM"],
  wam: 68.4,
  gpa: 5.4,
  studyYear: 2,
};

test("unit rules count completed units and report how far along the student is", () => {
  expect(
    evaluateRule(
      { ...base, kind: "units_total", subject: null, units: 24 },
      student,
    ),
  ).toEqual({
    status: "partial",
    measure: { kind: "units", value: 18, target: 24 },
  });
  expect(
    evaluateRule(
      { ...base, kind: "subject_units", subject: "COMP", units: 12 },
      student,
    ).status,
  ).toBe("met");
  expect(
    evaluateRule(
      {
        ...base,
        kind: "level_units",
        minimumLevel: 2000,
        maximumLevel: null,
        subject: "COMP",
        units: 12,
      },
      student,
    ).measure,
  ).toEqual({ kind: "units", value: 6, target: 12 });
});

test("a minimum mark is checked against the recorded mark", () => {
  expect(
    evaluateRule(course("COMP1100", { minimumMark: 65 }), student),
  ).toMatchObject({ status: "met", detail: "You got 72 in COMP1100" });
  expect(
    evaluateRule(course("COMP2100", { minimumMark: 65 }), student).status,
  ).toBe("unmet");
  expect(
    evaluateRule(course("MATH1005", { minimumMark: 65 }), student).status,
  ).toBe("unknown");
});

test("a concurrent requisite is met by this semester's enrolment", () => {
  expect(
    evaluateRule(
      course("COMP2310", { requirementMode: "completed_or_concurrent" }),
      student,
    ).status,
  ).toBe("met");
  expect(evaluateRule(course("COMP2310"), student).status).toBe("unmet");
});

test("WAM, GPA and year standing compare against the student's figures", () => {
  expect(
    evaluateRule({ ...base, kind: "wam", minimumWam: 70 }, student),
  ).toMatchObject({
    status: "unmet",
    measure: { kind: "score", value: 68.4, threshold: 70, scale: "wam" },
  });
  expect(
    evaluateRule({ ...base, kind: "gpa", minimumGpa: 5 }, student).status,
  ).toBe("met");
  expect(
    evaluateRule({ ...base, kind: "year_standing", minimumYear: 3 }, student),
  ).toMatchObject({ status: "unmet", detail: "You're in year 2" });
  expect(
    evaluateRule(
      { ...base, kind: "wam", minimumWam: 70 },
      { ...student, wam: null },
    ).status,
  ).toBe("unknown");
});

test("groups need the number of children their operator asks for", () => {
  const atLeastTwo: CourseRuleExpression = {
    kind: "group",
    operator: "at_least",
    minimumCount: 2,
    conditions: [course("COMP1100"), course("COMP2100"), course("COMP2300")],
  };
  expect(evaluateRule(atLeastTwo, student)).toEqual({
    status: "met",
    measure: { kind: "count", value: 2, target: 2 },
  });
  const both: CourseRuleExpression = {
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [course("COMP1100"), course("COMP2300")],
  };
  expect(evaluateRule(both, student).status).toBe("partial");
});

test("an incompatibility is met only while the other course is not completed", () => {
  expect(
    evaluateRule({ ...base, kind: "incompatible", code: "COMP1140" }, student)
      .status,
  ).toBe("met");
  expect(
    evaluateRule({ ...base, kind: "incompatible", code: "COMP1100" }, student)
      .status,
  ).toBe("unmet");
});

test("the student record takes marks and enrolments from the plan", () => {
  const record = studentRecord({
    attempts: [
      {
        id: "1",
        courseCode: "COMP1100",
        termId: "t1",
        status: "completed",
        mark: 80,
        unitsEarned: 6,
      },
      {
        id: "2",
        courseCode: "COMP1600",
        termId: "t1",
        status: "completed",
        mark: 60,
        unitsEarned: 6,
      },
      { id: "3", courseCode: "COMP2310", termId: "t2", status: "enrolled" },
    ],
    commencementYear: null,
    completedCourses: [
      { code: "COMP1100", units: 6 },
      { code: "COMP1600", units: 6 },
    ],
    programmeCodes: ["aacom"],
  });
  expect(record.completed.get("COMP1100")).toEqual({ units: 6, mark: 80 });
  expect(record.enrolled.has("COMP2310")).toBe(true);
  expect(record.programmeCodes).toEqual(["AACOM"]);
  expect(record.wam).toBe(70);
  expect(record.studyYear).toBeNull();
});
