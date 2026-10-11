import type { RequirementTreeCondition } from "@/lib/coursemap/requirement-tree-node";
import type { Course } from "@/lib/coursemap/types";
import { courses } from "./catalogue";

export function clarityRule(
  overrides: Partial<RequirementTreeCondition> = {},
): RequirementTreeCondition {
  return {
    type: "condition",
    id: 901,
    conditionKind: "course_set_units",
    freeText: null,
    maximumLevel: null,
    maximumUnits: null,
    minimumCourses: null,
    minimumLevel: null,
    minimumUnits: 12,
    options: ["COMP1100", "COMP1110", "COMP2100"].map((code, position) => ({
      code,
      kind: "course",
      position,
      structureKind: null,
    })),
    position: 0,
    projectionKey: "clarity-rule",
    sourceLocator: "",
    sourceText: "",
    structureKind: null,
    subjectCode: null,
    tag: null,
    scope: "part",
    includesAnyCourse: false,
    ...overrides,
  };
}

export function clarityCourse(code: string, units = 6): Course {
  return {
    ...courses[0]!,
    code,
    name: code,
    subject: code.slice(0, 4),
    year: 2026,
    level: Number(code[4]) * 1000,
    units,
    unitValue: { kind: "fixed", units },
  };
}
