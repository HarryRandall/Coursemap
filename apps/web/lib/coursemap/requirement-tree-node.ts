import type {
  PlanRequirementCondition,
  PlanRequirementGroup,
  PlanRequirementOption,
} from "@/lib/coursemap/plan-catalogue";

/**
 * The requirement display kit reads a superset of the plan catalogue tree:
 * the planner never needed a condition's mark, standing, average or the
 * catalogue code it names, but a published structure and an import preview do.
 * Every addition is optional, so a plan catalogue tree stays assignable and no
 * conversion step sits between the two.
 */
export type RequirementTreeOption = PlanRequirementOption & {
  title?: string | null;
};

export type RequirementTreeCondition = Omit<
  PlanRequirementCondition,
  "options"
> & {
  options: RequirementTreeOption[];
  /** Catalogue code for course, incompatible and structure conditions. */
  itemCode?: string | null;
  minimumGpa?: number | null;
  minimumMark?: number | null;
  minimumWam?: number | null;
  minimumYear?: number | null;
  requirementMode?: "completed" | "completed_or_concurrent" | null;
};

export type RequirementTreeGroup = Omit<PlanRequirementGroup, "children"> & {
  children: RequirementTreeNode[];
};

export type RequirementTreeNode =
  RequirementTreeGroup | RequirementTreeCondition;
