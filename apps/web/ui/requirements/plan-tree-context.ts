import type {
  Attempt,
  Course,
  RequirementPlacementChoice,
} from "@/lib/coursemap/types";
import type {
  PlanCatalogue,
  PlanRequirementGroup,
} from "@/lib/coursemap/plan-catalogue";
import {
  allocateRequirements,
  placementOptions,
  requirementConditionsByKey,
  requirementTreeProgress,
} from "@/lib/coursemap/requirement-progress";
import { requirementCourseStatus } from "@/lib/coursemap/requirement-display";
import { planningCourseForAttempt } from "@/lib/planner";
import {
  conditionHeading,
  type RequirementTreeCondition,
  type TreeContext,
} from "@/ui/requirements/requirement-presentation";

/** Each course in the plan by the furthest it has come. */
export function attemptStatusByCode(attempts: readonly Attempt[]) {
  return new Map(
    [...new Set(attempts.map((attempt) => attempt.courseCode))].flatMap(
      (code) => {
        const status = requirementCourseStatus(code, attempts);
        return status ? [[code, status] as const] : [];
      },
    ),
  );
}

/**
 * How one of the student's structures reads against their plan: where each
 * course counts, how far each rule has come, and how to move a course
 * between rules.
 */
export function planTreeContext({
  structureCode,
  root,
  catalogue,
  attempts,
  placements,
  statuses,
  selectedStructureCodes,
  unitTarget,
  onPlace,
  onAddCourse,
}: {
  structureCode: string;
  root: PlanRequirementGroup | null;
  catalogue: PlanCatalogue;
  attempts: readonly Attempt[];
  placements: readonly RequirementPlacementChoice[];
  statuses: TreeContext["attemptStatusByCode"];
  selectedStructureCodes: ReadonlySet<string>;
  unitTarget: number | null;
  onPlace: (
    courseCode: string,
    placement: { structureCode: string; requirementKey: string } | null,
  ) => void;
  onAddCourse?: (course: Course) => void;
}): TreeContext {
  const conditions = requirementConditionsByKey(root);
  const nodeKeyFor = (projectionKey: string) =>
    [...conditions].find(
      ([, condition]) => condition.projectionKey === projectionKey,
    )?.[0];
  // A student's choices name rules by their stable key; a choice for a rule
  // this version no longer has is simply not applied.
  const pins = new Map(
    placements.flatMap((choice) => {
      const nodeKey =
        choice.structureCode === structureCode
          ? nodeKeyFor(choice.requirementKey)
          : undefined;
      return nodeKey ? [[choice.courseCode, nodeKey] as const] : [];
    }),
  );
  const allocation = allocateRequirements({
    root,
    attempts,
    catalogue,
    pins,
  });
  const labelFor = (nodeKey: string) => {
    const condition = conditions.get(nodeKey);
    return condition
      ? conditionHeading(condition as RequirementTreeCondition)
      : "another requirement";
  };
  return {
    catalogue,
    progress: requirementTreeProgress({
      root,
      attempts,
      catalogue,
      allocation,
    }),
    placement: {
      allocation,
      labelFor,
      optionsFor: (courseCode: string) => {
        const attempt = attempts.find(
          (candidate) => candidate.courseCode === courseCode,
        );
        const course = attempt
          ? planningCourseForAttempt(attempt, catalogue)
          : undefined;
        return course
          ? placementOptions({ root, course }).map((nodeKey) => ({
              nodeKey,
              label: labelFor(nodeKey),
            }))
          : [];
      },
      onPlace: (courseCode: string, nodeKey: string | null) => {
        const projectionKey = nodeKey
          ? conditions.get(nodeKey)?.projectionKey
          : undefined;
        onPlace(
          courseCode,
          projectionKey
            ? { structureCode, requirementKey: projectionKey }
            : null,
        );
      },
    },
    attemptStatusByCode: statuses,
    selectedStructureCodes,
    unitTarget,
    onAddCourse,
  };
}
