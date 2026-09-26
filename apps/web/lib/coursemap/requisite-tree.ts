import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

export type CourseRuleCondition = Exclude<
  CourseRuleExpression,
  { kind: "group" }
>;
