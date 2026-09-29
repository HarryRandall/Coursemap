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
  expect(record.completed.get("COMP1100")).toEqual({
    units: 6,
    mark: 80,
    tags: [],
  });
  expect(record.enrolled.has("COMP2310")).toBe(true);
  expect(record.programmeCodes).toEqual(["AACOM"]);
  expect(record.wam).toBe(70);
  expect(record.studyYear).toBeNull();
});

test("tagged units count completed courses carrying the tag, however it is cased", () => {
  const tagged: StudentRecord = {
    ...student,
    completed: new Map([
      ["PHYS1101", { units: 6, mark: 70, tags: ["science"] }],
      ["CHEM1101", { units: 6, mark: 70, tags: ["Science", "Laboratory"] }],
      ["ARTH1001", { units: 6, mark: 70, tags: ["Arts"] }],
    ]),
  };
  expect(
    evaluateRule(
      { ...base, kind: "tagged_units", tag: "Science", units: 18 },
      tagged,
    ),
  ).toEqual({
    status: "partial",
    measure: { kind: "units", value: 12, target: 18 },
  });
});

test("concurrent enrolment cannot satisfy a required mark", () => {
  expect(
    evaluateRule(
      course("COMP2310", {
        requirementMode: "completed_or_concurrent",
        minimumMark: 60,
      }),
      student,
    ).status,
  ).toBe("unknown");
});

test("grade-only results settle thresholds only when their band proves them", () => {
  const record = studentRecord({
    attempts: [
      {
        id: "grade",
        courseCode: "FINM3009",
        termId: "t1",
        status: "completed",
        resultCode: "CR",
        unitsEarned: 6,
      },
    ],
    commencementYear: null,
    completedCourses: [{ code: "FINM3009", units: 6 }],
    programmeCodes: [],
  });
  for (const [minimumMark, status] of [
    [60, "met"],
    [65, "unknown"],
    [70, "unmet"],
  ] as const) {
    expect(
      evaluateRule(course("FINM3009", { minimumMark }), record).status,
    ).toBe(status);
  }
  expect(record.completed.get("FINM3009")?.mark).toBeNull();
  expect(
    evaluateRule(course("FINM3009", { minimumMark: 60 }), {
      ...record,
      completed: new Map([
        ["FINM3009", { units: 6, mark: null, resultCode: "PS" }],
      ]),
    }).status,
  ).toBe("unknown");
});

test("subject course counts use distinct completions without inferring units or accepting enrolment", () => {
  const condition: CourseRuleExpression = {
    ...base,
    kind: "subject_courses",
    subject: "STAT",
    minimumCount: 2,
  };
  const record: StudentRecord = {
    ...student,
    completed: new Map([
      ["STAT1003", { units: 0, mark: null }],
      ["MATH1005", { units: 24, mark: 80 }],
    ]),
    enrolled: new Set(["STAT2001"]),
  };
  expect(evaluateRule(condition, record)).toEqual({
    status: "partial",
    measure: { kind: "count", value: 1, target: 2 },
  });
  expect(evaluateRule({ ...condition, minimumCount: 1 }, record).status).toBe(
    "met",
  );
  expect(
    evaluateRule(condition, {
      ...record,
      completed: new Map([
        ...record.completed,
        ["STAT2001", { units: 12, mark: 80 }],
      ]),
    }).status,
  ).toBe("met");
  expect(
    evaluateRule(condition, { ...record, completed: new Map() }).status,
  ).toBe("unmet");
});

test("concurrent exclusions reject enrolment but allow previous completion", () => {
  const concurrent: CourseRuleExpression = {
    ...base,
    kind: "incompatible_concurrent",
    code: "COMP1100",
  };
  expect(evaluateRule(concurrent, student).status).toBe("met");
  expect(
    evaluateRule({ ...concurrent, code: "COMP2310" }, student),
  ).toMatchObject({ status: "unmet", detail: "You are enrolled in COMP2310" });
  expect(
    evaluateRule({ ...concurrent, kind: "incompatible" }, student).status,
  ).toBe("unmet");
});

test("an unresolved permission alternative stays unknown when it could satisfy the group", () => {
  const permission: CourseRuleExpression = {
    ...base,
    kind: "permission",
    text: "Convener permission",
  };
  const group: CourseRuleExpression = {
    ...base,
    kind: "group",
    operator: "any_of",
    minimumCount: null,
    conditions: [course("MATH1113"), permission],
  };
  expect(evaluateRule(group, student).status).toBe("unknown");
  expect(
    evaluateRule(group, { ...student, permissionApproved: true }).status,
  ).toBe("met");
  expect(
    evaluateRule(group, { ...student, permissionApproved: false }).status,
  ).toBe("unmet");
  expect(
    evaluateRule(
      { ...group, conditions: [course("COMP1100"), permission] },
      student,
    ).status,
  ).toBe("met");
  expect(evaluateRule({ ...group, operator: "all_of" }, student).status).toBe(
    "unmet",
  );
  expect(
    evaluateRule(
      {
        ...group,
        operator: "all_of",
        conditions: [course("COMP1100"), permission],
      },
      student,
    ).status,
  ).toBe("unknown");
  expect(
    evaluateRule(
      {
        ...group,
        operator: "at_least",
        minimumCount: 2,
        conditions: [course("COMP1100"), course("MATH1113"), permission],
      },
      student,
    ).status,
  ).toBe("unknown");
});

test("commencement-year boundaries use the recorded calendar year independently of standing", () => {
  const condition: CourseRuleExpression = {
    ...base,
    kind: "commencement_year",
    minimumCommencementYear: null,
    maximumCommencementYear: 2020,
  };
  for (const [year, expected] of [
    [2019, "met"],
    [2020, "met"],
    [2021, "unmet"],
    [null, "unknown"],
    [0, "unknown"],
  ] as const)
    expect(
      evaluateRule(condition, {
        ...student,
        commencementYear: year,
        studyYear: 1,
      }).status,
    ).toBe(expected);
  expect(evaluateRule(condition, { ...student, studyYear: 2020 }).status).toBe(
    "unknown",
  );
  expect(
    evaluateRule(
      {
        ...condition,
        minimumCommencementYear: 2020,
        maximumCommencementYear: 2020,
      },
      { ...student, commencementYear: 2020 },
    ).status,
  ).toBe("met");
});
