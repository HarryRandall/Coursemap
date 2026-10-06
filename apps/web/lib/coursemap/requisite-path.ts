import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  evaluateRule,
  groupRequiredCount,
  type StudentRecord,
} from "@/lib/coursemap/requisite-evaluation";

/** Every course a rule names, in the order it names them. */
export function courseCodes(expression: CourseRuleExpression | null): string[] {
  if (!expression) return [];
  if (expression.kind === "group")
    return expression.conditions.flatMap(courseCodes);
  return expression.kind === "course" ? [expression.code] : [];
}

/** An example student who has completed exactly these courses. */
export function studentWith(
  codes: readonly string[],
  year: number,
): StudentRecord {
  return {
    completed: new Map(
      codes.map((code) => [code, { units: 6, mark: 75 }] as const),
    ),
    enrolled: new Set(),
    programmeCodes: [],
    wam: 75,
    gpa: 6,
    studyYear: 2,
    commencementYear: year - 1,
  };
}

/**
 * How far a student is through a rule, from 0 to 1. A group counts only its
 * best children up to the number it needs, so finishing a second option of
 * an "any of" adds nothing.
 */
function ruleProgress(
  expression: CourseRuleExpression,
  student: StudentRecord,
): number {
  if (expression.kind !== "group")
    return evaluateRule(expression, student).status === "met" ? 1 : 0;
  const needed = Math.max(1, groupRequiredCount(expression));
  const best = expression.conditions
    .map((child) => ruleProgress(child, student))
    .sort((left, right) => right - left)
    .slice(0, needed);
  return Math.min(1, best.reduce((total, value) => total + value, 0) / needed);
}

/**
 * The courses a student would complete, in the order the rule names them,
 * to meet it: each one only if it meets something new, so the first option
 * of an "any of" is taken and its alternatives are skipped. Stops once the
 * whole rule is met.
 */
export function completionPath(
  rule: CourseRuleExpression | null,
  year: number,
): string[] {
  if (!rule) return [];
  const path: string[] = [];
  for (const code of new Set(courseCodes(rule))) {
    const before = studentWith(path, year);
    if (evaluateRule(rule, before).status === "met") break;
    const after = studentWith([...path, code], year);
    if (ruleProgress(rule, after) > ruleProgress(rule, before)) path.push(code);
  }
  return path;
}
