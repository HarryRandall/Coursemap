import { expect, test } from "vitest";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import { evaluateRule } from "@/lib/coursemap/requisite-evaluation";
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
  minimumMark: 65,
  requirementMode: "completed",
});

const rule: CourseRuleExpression = {
  kind: "group",
  operator: "all_of",
  minimumCount: null,
  conditions: [
    { ...base, kind: "units_total", subject: null, units: 72 },
    { ...base, kind: "subject_units", subject: "COMP", units: 24 },
    {
      ...base,
      kind: "level_units",
      minimumLevel: 2000,
      maximumLevel: null,
      subject: "COMP",
      units: 12,
    },
    {
      kind: "group",
      operator: "at_least",
      minimumCount: 2,
      conditions: [course("COMP2100"), course("COMP2120"), course("COMP2300")],
    },
    { ...base, kind: "wam", minimumWam: 70 },
    { ...base, kind: "year_standing", minimumYear: 3 },
    { ...base, kind: "structure", structureCode: "AACOM", text: null },
  ],
};

test("the complete sample meets every checkable part of the rule", () => {
  const student = sampleStudent(rule, "complete");
  expect(evaluateRule(rule, student).status).toBe("met");
});

test("the partway sample is part of the way, not done or untouched", () => {
  expect(evaluateRule(rule, sampleStudent(rule, "partway")).status).toBe(
    "partial",
  );
});

test("the new student has nothing on their record", () => {
  const student = sampleStudent(rule, "new");
  expect(student.completed.size).toBe(0);
  expect(evaluateRule(rule, student).status).toBe("unmet");
});

test("partway completes one alternative group without completing the next", () => {
  const student = sampleStudent(stat2001Requisites, "partway");
  expect([...student.completed.keys()]).toEqual(["STAT1003"]);
  expect(evaluateRule(stat2001Requisites, student).status).toBe("partial");
  expect(
    evaluateRule(
      stat2001Requisites,
      sampleStudent(stat2001Requisites, "complete"),
    ).status,
  ).toBe("met");
});

test("an untouched nested branch adds no course or unit progress", () => {
  const nested: CourseRuleExpression = {
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [course("STAT1003"), rule],
  };
  expect([...sampleStudent(nested, "partway").completed.keys()]).toEqual([
    "STAT1003",
  ]);
});

test("subject course count previews show distinct completions", () => {
  const expression: CourseRuleExpression = {
    ...base,
    kind: "subject_courses",
    subject: "STAT",
    minimumCount: 2,
  };
  expect(
    evaluateRule(expression, sampleStudent(expression, "complete")),
  ).toEqual({ status: "met", measure: { kind: "count", value: 2, target: 2 } });
  expect(
    evaluateRule(expression, sampleStudent(expression, "partway")).status,
  ).toBe("partial");
  expect(
    evaluateRule(expression, sampleStudent(expression, "new")).status,
  ).toBe("unmet");
});
