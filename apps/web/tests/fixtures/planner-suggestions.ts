import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import type { RequirementNodeProgress } from "@/lib/coursemap/requirement-progress";
import { structuresToPlan } from "@/ui/plan/plan-suggestions";
import { courses, terms } from "./catalogue";

export const suggestionsCatalogue: PlanCatalogue = {
  academicYear: 2026,
  courses,
  terms,
  degrees: [],
  majors: [],
  structures: [],
  structureRequirements: [],
  programmeRequirementsImported: true,
};
export function suggestionCondition(
  id: number,
  codes: string[],
  overrides: Partial<RequirementTreeCondition> = {},
): RequirementTreeCondition {
  return {
    type: "condition",
    id,
    conditionKind: "course_set_units",
    freeText: null,
    maximumLevel: null,
    maximumUnits: null,
    minimumCourses: codes.length,
    minimumLevel: null,
    minimumUnits: null,
    options: codes.map((code, position) => ({
      code,
      kind: "course",
      structureKind: null,
      position,
    })),
    position: id,
    projectionKey: `condition-${id}`,
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
export function suggestionGroup(
  id: number,
  children: RequirementTreeNode[],
  operator = "all_of",
): RequirementTreeGroup {
  return {
    type: "group",
    id,
    children,
    operator,
    description: null,
    groupKey: `group-${id}`,
    maximumUnits: null,
    minimumCount: null,
    minimumUnits: null,
    position: id,
    sourceLocator: "",
    sourceText: "",
    title: null,
    scope: "part",
  };
}
export function suggestions(
  children: RequirementTreeNode[],
  statuses: TreeContext["attemptStatusByCode"] = new Map(),
  progress: RequirementNodeProgress[] = [],
  catalogue: PlanCatalogue = suggestionsCatalogue,
) {
  const root = suggestionGroup(100, children);
  const context: TreeContext = {
    catalogue,
    attemptStatusByCode: statuses,
    selectedStructureCodes: new Set(),
    progress: new Map(progress.map((item) => [item.key, item])),
  };
  return structuresToPlan({
    catalogue,
    structures: [
      { code: "TEST", kind: "programme", name: "Test degree", root, context },
    ],
  })[0];
}
