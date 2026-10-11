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
import { requirementTitle } from "@/lib/coursemap/requirement-titles";
import {
  conditionHeading,
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
  const structure = catalogue.structures.find(
    (candidate) => candidate.code === structureCode,
  );
  const contextLabel =
    structure?.kind === "programme"
      ? "Degree"
      : (structure?.name ?? structureCode);
  const yearCourses = catalogue.courses.filter(
    (course) => course.year === catalogue.academicYear,
  );
  const labels = new Map(
    [...conditions].map(([key, condition]) => [
      key,
      `${contextLabel} · ${requirementTitle(condition, yearCourses) ?? conditionHeading(condition)}`,
    ]),
  );
  for (const label of new Set(labels.values())) {
    const collisions = [...conditions.keys()].filter(
      (candidate) => labels.get(candidate) === label,
    );
    if (collisions.length < 2) continue;
    for (const candidate of collisions) {
      const rule = conditions.get(candidate)!;
      const detail = [
        rule.options.map((option) => option.code).join(", "),
        rule.minimumUnits !== null ? `${rule.minimumUnits} units` : null,
        rule.maximumUnits !== null ? `up to ${rule.maximumUnits} units` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      labels.set(
        candidate,
        `${label} · ${detail || rule.sourceText || `Rule ${rule.position + 1}`}`,
      );
    }
  }
  // Identical source rules still need distinct choices with stable labels.
  const seen = new Set<string>();
  for (const [key, label] of labels) {
    if (seen.has(label))
      labels.set(
        key,
        `${label} · Rule ${[...conditions.keys()].indexOf(key) + 1}`,
      );
    seen.add(labels.get(key)!);
  }
  const labelFor = (nodeKey: string) =>
    labels.get(nodeKey) ?? "another requirement";
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
