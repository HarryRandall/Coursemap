import type { CourseRuleExpression } from "@/lib/coursemap/course-types";
import type {
  RequirementTreeCondition,
  RequirementTreeOption,
} from "@/lib/coursemap/requirement-tree-node";

export type CourseRuleCondition = Exclude<
  CourseRuleExpression,
  { kind: "group" }
>;

/**
 * One course rule condition in the shared requirement shape, so a requisite
 * reads through the same vocabulary as a programme requirement instead of
 * falling back to the ANU prose for every kind the narrow summary never
 * covered.
 */
export function requisiteConditionNode(
  condition: CourseRuleCondition,
  position = 0,
): RequirementTreeCondition {
  const options: RequirementTreeOption[] =
    condition.kind === "course_set_units"
      ? condition.courseCodes.map((code, index) => ({
          code,
          kind: "course",
          position: index,
          structureKind: null,
        }))
      : condition.kind === "structure_set"
        ? condition.structureCodes.map((code, index) => ({
            code,
            kind: "structure",
            position: index,
            structureKind: condition.structureKind,
          }))
        : [];
  return {
    type: "condition",
    conditionKind: condition.kind,
    freeText:
      condition.kind === "permission" ||
      condition.kind === "other" ||
      condition.kind === "structure"
        ? condition.text
        : null,
    id: position,
    itemCode:
      condition.kind === "course" || condition.kind === "incompatible"
        ? condition.code
        : condition.kind === "structure"
          ? condition.structureCode
          : null,
    maximumLevel:
      condition.kind === "level_units" ? condition.maximumLevel : null,
    maximumUnits: null,
    minimumCourses:
      condition.kind === "structure_set" ? condition.minimumCount : null,
    minimumGpa: condition.kind === "gpa" ? condition.minimumGpa : null,
    minimumLevel:
      condition.kind === "level_units" ? condition.minimumLevel : null,
    minimumMark: condition.kind === "course" ? condition.minimumMark : null,
    minimumUnits:
      condition.kind === "units_total" ||
      condition.kind === "subject_units" ||
      condition.kind === "level_units" ||
      condition.kind === "course_set_units" ||
      condition.kind === "tagged_units" ||
      condition.kind === "elective_units"
        ? condition.units
        : null,
    minimumWam: condition.kind === "wam" ? condition.minimumWam : null,
    minimumYear:
      condition.kind === "year_standing" ? condition.minimumYear : null,
    options,
    position,
    projectionKey: `${condition.kind}-${position}`,
    requirementMode:
      condition.kind === "course" ? condition.requirementMode : null,
    sourceLocator: "",
    sourceText: condition.sourceText,
    structureKind:
      condition.kind === "structure_set" ? condition.structureKind : null,
    subjectCode:
      condition.kind === "units_total" ||
      condition.kind === "subject_units" ||
      condition.kind === "level_units"
        ? condition.subject
        : null,
    tag: condition.kind === "tagged_units" ? condition.tag : null,
  };
}
