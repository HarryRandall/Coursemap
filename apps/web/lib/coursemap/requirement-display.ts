import type { Attempt, Profile } from "@/lib/coursemap/types";
import type {
  PlanCatalogue,
  PlanRequirementCondition,
  PlanRequirementNode,
} from "@/lib/coursemap/plan-catalogue";

export function requirementCourseCodes(
  node: PlanRequirementNode | null,
): string[] {
  if (!node) return [];
  if (node.type === "condition")
    return node.options
      .filter((option) => option.kind === "course")
      .map((option) => option.code);
  return [...new Set(node.children.flatMap(requirementCourseCodes))];
}

export function requirementCourseStatus(
  code: string,
  attempts: readonly Attempt[],
) {
  const matches = attempts.filter((attempt) => attempt.courseCode === code);
  if (matches.some((attempt) => attempt.status === "completed"))
    return "completed";
  if (matches.some((attempt) => attempt.status === "enrolled"))
    return "enrolled";
  if (matches.some((attempt) => attempt.status === "planned")) return "planned";
  return null;
}

export function requirementCourseHeading(condition: PlanRequirementCondition) {
  const count = condition.options.filter(
    (option) => option.kind === "course",
  ).length;
  if (condition.minimumCourses !== null && condition.minimumCourses >= count) {
    return count === 1 ? "Compulsory course" : "Compulsory courses";
  }
  if (condition.minimumCourses !== null)
    return `Choose ${condition.minimumCourses} ${condition.minimumCourses === 1 ? "course" : "courses"}`;
  if (condition.minimumUnits !== null)
    return `Choose ${condition.minimumUnits} units`;
  return "Course options";
}

/**
 * Courses named by the student's chosen degree, major, minors and
 * specialisations that are not yet anywhere in their plan, in requirement
 * order. Withdrawn attempts do not count as planned.
 */
export function recommendedCourseCodes(
  catalogue: Pick<PlanCatalogue, "structureRequirements">,
  profile: Pick<
    Profile,
    "degreeCode" | "majorCode" | "minorCodes" | "specialisationCodes"
  >,
  attempts: readonly Attempt[],
): string[] {
  const chosen = new Set(
    [
      profile.degreeCode,
      profile.majorCode,
      ...(profile.minorCodes ?? []),
      ...(profile.specialisationCodes ?? []),
    ].filter(Boolean),
  );
  const planned = new Set(
    attempts
      .filter((attempt) => attempt.status !== "withdrawn")
      .map((attempt) => attempt.courseCode),
  );
  return [
    ...new Set(
      catalogue.structureRequirements
        .filter((structure) => chosen.has(structure.structureCode))
        .flatMap((structure) => requirementCourseCodes(structure.root)),
    ),
  ].filter((code) => !planned.has(code));
}
