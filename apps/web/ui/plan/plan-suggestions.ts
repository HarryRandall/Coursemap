import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import {
  conditionHeading,
  conditionTone,
  hidesCondition,
  listedCourseCounts,
  requirementRowStatus,
  suggestedCourses,
  type RequirementTreeCondition,
  type RequirementTreeGroup,
  type RequirementTreeNode,
  type TreeContext,
} from "@/ui/requirements/requirement-presentation";

export type PlannedStructure = {
  code: string;
  name: string;
  root: RequirementTreeGroup;
  context: TreeContext;
};

export type CourseToPlan = {
  course: Course;
  /** A compulsory course rather than one of several that would count. */
  required: boolean;
  /** A few words on the rule it counts towards, such as "COMP courses". */
  tag: string;
};

/** Rules that still need courses, from the top of the tree down. */
function rulesToPlan(
  node: RequirementTreeNode,
  context: TreeContext,
): RequirementTreeCondition[] {
  if (node.type === "group") {
    return requirementRowStatus(node, context).kind === "todo"
      ? node.children.flatMap((child) => rulesToPlan(child, context))
      : [];
  }
  if (hidesCondition(node, context) || conditionTone(node) !== "requirement")
    return [];
  return requirementRowStatus(node, context).kind === "todo" ? [node] : [];
}

/** How many rules still need courses across the student's structures. */
export function rulesToPlanCount(structures: PlannedStructure[]) {
  return structures.reduce(
    (total, structure) =>
      total + rulesToPlan(structure.root, structure.context).length,
    0,
  );
}

/** The version of a course to plan in a semester: that year's, or the latest. */
export function courseForTerm(
  code: string,
  term: Term,
  catalogue: PlanCatalogue,
): Course | undefined {
  const versions = catalogue.courses.filter((course) => course.code === code);
  return (
    versions.find((course) => course.year === term.year) ??
    versions.find((course) => course.year === catalogue.academicYear)
  );
}

/**
 * Courses the plan still needs, split into the compulsory ones and a few
 * that would count towards each open choice, in requirement order.
 */
export function coursesToPlan({
  structures,
  attempts,
  catalogue,
  perRule = 3,
}: {
  structures: PlannedStructure[];
  attempts: Attempt[];
  catalogue: PlanCatalogue;
  perRule?: number;
}) {
  const planned = new Set(
    attempts
      .filter((attempt) => attempt.status !== "withdrawn")
      .map((attempt) => attempt.courseCode),
  );
  const seen = new Set<string>();
  const required: CourseToPlan[] = [];
  const suggested: CourseToPlan[] = [];
  structures.forEach((structure) => {
    rulesToPlan(structure.root, structure.context).forEach((rule) => {
      const listed = listedCourseCounts(rule, structure.context);
      const compulsory = listed.codes.length > 0 && listed.required;
      const courses = (
        listed.codes.length > 0
          ? listed.codes.flatMap((code) => {
              const course = catalogue.courses.find(
                (item) =>
                  item.code === code && item.year === catalogue.academicYear,
              );
              return course ? [course] : [];
            })
          : suggestedCourses(rule, structure.context, perRule + 3)
      ).filter((course) => !planned.has(course.code) && !seen.has(course.code));
      const tag = compulsory ? "Required" : conditionHeading(rule);
      (compulsory ? courses : courses.slice(0, perRule)).forEach((course) => {
        seen.add(course.code);
        (compulsory ? required : suggested).push({
          course,
          required: compulsory,
          tag,
        });
      });
    });
  });
  return { required, suggested };
}
