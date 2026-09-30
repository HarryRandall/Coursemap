import { expect, test } from "vitest";
import { requirementSliceExpression } from "@/lib/catalogue/requirement-expression";
import type { RequirementWrite } from "@/lib/catalogue/content";

type Group = RequirementWrite["groups"][number];
type Condition = RequirementWrite["conditions"][number];

function group(overrides: Partial<Group>): Group {
  return {
    key: "root",
    ruleKey: "prerequisite",
    parentKey: null,
    label: null,
    description: null,
    operator: "all_of",
    minimumCount: null,
    minimumUnits: null,
    maximumUnits: null,
    sourceText: null,
    sourceLocator: null,
    position: 0,
    ...overrides,
  };
}

function course(key: string, groupKey: string, position: number, code: string) {
  return {
    key,
    ruleKey: "prerequisite",
    groupKey,
    position,
    kind: "course",
    itemCode: code,
    itemKind: "course",
    structureKind: null,
    requirementMode: "completed",
    minimumMark: null,
    minimumUnits: null,
    maximumUnits: null,
    minimumCount: null,
    subjectCode: null,
    minimumLevel: null,
    maximumLevel: null,
    minimumYear: null,
    minimumGpa: null,
    minimumWam: null,
    tag: null,
    freeText: null,
    hardness: "hard",
    sourceText: "TSTF2001; and, TSTF2003 or TSTF3011.",
    sourceLocator: null,
    reviewState: "automatic",
    confidence: 1,
  } satisfies Condition;
}

test("builds a rule's groups and conditions into the course page's tree", () => {
  const expression = requirementSliceExpression({
    groups: [
      group({ key: "root" }),
      group({
        key: "either",
        parentKey: "root",
        operator: "any_of",
        position: 1,
      }),
    ],
    conditions: [
      course("a", "root", 0, "tstf2001"),
      course("b", "either", 0, "TSTF2003"),
      course("c", "either", 1, "TSTF3011"),
    ],
  });
  expect(expression).toMatchObject({
    kind: "group",
    operator: "all_of",
    conditions: [
      { kind: "course", code: "TSTF2001" },
      {
        kind: "group",
        operator: "any_of",
        conditions: [
          { kind: "course", code: "TSTF2003" },
          { kind: "course", code: "TSTF3011" },
        ],
      },
    ],
  });
});

test("has no tree for a rule without groups", () => {
  expect(requirementSliceExpression({ conditions: [] })).toBeNull();
});
