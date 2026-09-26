import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { courseIsAvailable, evaluateCoursePrerequisites } from "@/lib/planner";
import {
  conditionSummary,
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

export type TermSuggestion = {
  course: Course;
  /** A compulsory course rather than one of several that would count. */
  required: boolean;
  reason: string;
  /** Prerequisites not completed or planned before this semester. */
  missingCodes: string[];
  /** Prerequisites the planner cannot check, such as a permission. */
  unchecked: boolean;
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
 * Courses that would fill a gap in a semester and move a requirement along:
 * offered then, not in the plan yet, compulsory ones first and ones the
 * student can already take before ones waiting on a prerequisite.
 */
export function termSuggestions({
  term,
  structures,
  attempts,
  catalogue,
  limit = 4,
}: {
  term: Term;
  structures: PlannedStructure[];
  attempts: Attempt[];
  catalogue: PlanCatalogue;
  limit?: number;
}): TermSuggestion[] {
  const planned = new Set(
    attempts
      .filter((attempt) => attempt.status !== "withdrawn")
      .map((attempt) => attempt.courseCode),
  );
  const seen = new Set<string>();
  const ranked: Array<{ suggestion: TermSuggestion; rank: number }> = [];
  structures.forEach((structure) => {
    rulesToPlan(structure.root, structure.context).forEach((rule) => {
      const listed = listedCourseCounts(rule, structure.context);
      const required = listed.codes.length > 0 && listed.required;
      const courses =
        listed.codes.length > 0
          ? listed.codes.flatMap((code) => {
              const course = courseForTerm(code, term, catalogue);
              return course ? [course] : [];
            })
          : suggestedCourses(rule, structure.context, 8);
      const reason = required ? "Compulsory course" : conditionSummary(rule);
      courses.forEach((course) => {
        if (
          seen.has(course.code) ||
          planned.has(course.code) ||
          (course.sessions.length > 0 && !courseIsAvailable(course, term.name))
        )
          return;
        seen.add(course.code);
        const preview: Attempt = {
          id: `suggestion-${course.code}`,
          academicYear: course.year,
          courseCode: course.code,
          termId: term.id,
          status: "planned",
        };
        const prerequisites = evaluateCoursePrerequisites(
          preview,
          [...attempts, preview],
          { ...catalogue, courses: [...catalogue.courses, course] },
        );
        ranked.push({
          suggestion: {
            course,
            required,
            reason:
              structures.length > 1 ? `${structure.name} · ${reason}` : reason,
            missingCodes: prerequisites.missingCodes,
            unchecked: prerequisites.state === "unknown",
          },
          rank:
            (prerequisites.state === "unsatisfied"
              ? 2
              : prerequisites.state === "unknown"
                ? 1
                : 0) *
              2 +
            (required ? 0 : 1),
        });
      });
    });
  });
  return ranked
    .map((item, order) => ({ ...item, order }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((item) => item.suggestion);
}
