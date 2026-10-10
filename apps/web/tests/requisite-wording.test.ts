import { expect, test } from "vitest";
import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import {
  groupLabel,
  groupSentence,
  splitRequisiteRule,
} from "@/ui/courses/requisite-wording";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "verified" as const,
  sourceText: "",
};

// Imported as ANTH2025: "completed GEND2035 or ANTH6025".
const exclusions = {
  kind: "group",
  operator: "any_of",
  minimumCount: null,
  conditions: [
    { ...base, kind: "incompatible", code: "GEND2035" },
    { ...base, kind: "incompatible", code: "ANTH6025" },
  ],
} satisfies CourseRuleExpression;

test("exclusions listed as either course read as avoiding both", () => {
  expect(groupLabel(exclusions)).toBe("Both");
  expect(groupSentence(exclusions)).toBe("Meet all of these");
  const split = splitRequisiteRule({
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [
      {
        ...base,
        kind: "course",
        code: "ANTH1002",
        minimumMark: null,
        requirementMode: "completed",
      },
      exclusions,
    ],
  });
  expect(split.incompatible).toEqual(["GEND2035", "ANTH6025"]);
  expect(split.requirements).toHaveLength(1);
});

test("a choice that includes a permission waiver keeps reading as a choice", () => {
  const waiver = {
    ...exclusions,
    conditions: [
      exclusions.conditions[0],
      { ...base, kind: "permission", text: "Permission of the convener" },
    ],
  } satisfies CourseRuleExpression;
  expect(groupLabel(waiver)).toBe("Any 1 of 2");
  expect(groupSentence(waiver)).toBe("Meet one of these");
});
