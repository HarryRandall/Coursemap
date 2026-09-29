import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

export type CourseRuleCondition = Exclude<
  CourseRuleExpression,
  { kind: "group" }
>;

/** Permission clauses retain their wording wherever they occur in a rule. */
export function permissionClauses(
  expression: CourseRuleExpression | null,
): string[] {
  if (!expression) return [];
  if (expression.kind === "permission") return [expression.text];
  if (expression.kind === "group")
    return expression.conditions.flatMap(permissionClauses);
  return [];
}
