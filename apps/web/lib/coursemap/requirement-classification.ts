import type { RequirementTreeCondition } from "@/lib/coursemap/requirement-tree-node";

/**
 * How a condition should read. A cap on where units may come from is not
 * something to complete, and an incompatibility is a warning rather than a
 * rule to work towards, so neither may be drawn as progress.
 */
export type ConditionTone = "requirement" | "limit" | "warning" | "note";

export function conditionTone(
  condition: RequirementTreeCondition,
): ConditionTone {
  if (condition.conditionKind === "incompatible") return "warning";
  if (
    condition.conditionKind === "permission" ||
    condition.conditionKind === "other"
  ) {
    return "note";
  }
  if (
    condition.maximumUnits !== null &&
    (condition.minimumUnits === null ||
      (condition.minimumUnits === 0 &&
        condition.maximumUnits > 0 &&
        (condition.minimumCourses === null || condition.minimumCourses === 0)))
  ) {
    return "limit";
  }
  return "requirement";
}

/** What a surface already shows around a tree, so a rule can tell whether it draws at all. */
export type RequirementReading = {
  unitTarget?: number | null;
  /**
   * The requirements workspace picks majors and minors through its own
   * chooser, so it leaves structure options out of the tree. Reading surfaces
   * with no chooser of their own opt in.
   */
  showStructureOptions?: boolean;
};

/**
 * Whether a condition draws nothing: a total that only restates the unit
 * target already shown above the tree, or structure options on a surface
 * that picks structures through its own chooser.
 */
export function hidesCondition(
  condition: RequirementTreeCondition,
  reading: RequirementReading,
) {
  if (condition.conditionKind === "structure_set") {
    return !reading.showStructureOptions;
  }
  return (
    condition.conditionKind === "units_total" &&
    condition.minimumUnits === reading.unitTarget &&
    condition.maximumUnits === null
  );
}
