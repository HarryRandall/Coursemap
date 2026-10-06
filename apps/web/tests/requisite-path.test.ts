import { expect, test } from "vitest";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import { completionPath } from "@/lib/coursemap/requisite-path";

const base = {
  confidence: 1,
  hardness: "hard",
  reviewState: "verified",
  sourceText: "",
} as const;
const course = (code: string): CourseRuleExpression => ({
  ...base,
  kind: "course",
  code,
  minimumMark: null,
  requirementMode: "completed",
});
const group = (
  operator: "all_of" | "any_of",
  conditions: CourseRuleExpression[],
): CourseRuleExpression => ({
  kind: "group",
  operator,
  minimumCount: null,
  conditions,
});

test("a completion path takes each needed course in order and skips alternatives", () => {
  const rule = group("all_of", [
    group("any_of", [course("COMP1110"), course("COMP1140")]),
    course("COMP1600"),
    group("any_of", [
      course("MATH1005"),
      group("all_of", [course("MATH1013"), course("MATH1014")]),
    ]),
  ]);
  expect(completionPath(rule, 2026)).toEqual([
    "COMP1110",
    "COMP1600",
    "MATH1005",
  ]);
});
