import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

const base = {
  confidence: 0,
  hardness: "hard" as const,
  reviewState: "automatic" as const,
  sourceText: "",
};

const course = (code: string, concurrent = false): CourseRuleExpression => ({
  ...base,
  kind: "course",
  code,
  minimumMark: null,
  requirementMode: concurrent ? "completed_or_concurrent" : "completed",
});

/** The structured prerequisite imported from ANU's 2026 STAT2001 page. */
export const stat2001Requisites: CourseRuleExpression = {
  kind: "group",
  operator: "all_of",
  minimumCount: null,
  conditions: [
    {
      kind: "group",
      operator: "any_of",
      minimumCount: null,
      conditions: [
        course("STAT1003"),
        course("STAT1008"),
        { ...base, kind: "structure", structureCode: "BADAN", text: null },
      ],
    },
    {
      kind: "group",
      operator: "any_of",
      minimumCount: null,
      conditions: [
        course("MATH1113"),
        course("MATH1115"),
        course("MATH1014", true),
      ],
    },
  ],
};
