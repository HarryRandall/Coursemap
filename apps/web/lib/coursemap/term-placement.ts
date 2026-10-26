import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import {
  OVERLOAD_PERMISSION_UNITS,
  STANDARD_TERM_UNITS,
  courseIsAvailable,
  evaluateCoursePrerequisites,
  isActiveAttempt,
  termLoad,
  type PlanningCatalogue,
} from "@/lib/planner";

/** What placing one course in one term would mean for that term. */
export type TermPlacement = {
  term: Term;
  offered: boolean;
  /** Units already in the term, leaving out the course itself when it is being moved. */
  currentUnits: number;
  unitsAfter: number;
  /** Above a standard full-time load of 24 units. */
  overload: boolean;
  /** Above the load a student may take without their college's permission. */
  needsPermission: boolean;
  /**
   * Whether the prerequisites are done or planned before the term. "unknown"
   * covers wording Coursemap cannot check, which the student reads themselves.
   */
  prerequisites: "met" | "missing" | "unknown";
  /** Courses the prerequisites name that are not done or planned before the term. */
  missingCodes: string[];
};

function placementAttempt(course: Course, termId: string): Attempt {
  return {
    id: "placement",
    academicYear: course.year,
    courseCode: course.code,
    termId,
    status: "planned",
  };
}

function prerequisiteState(
  evaluation: ReturnType<typeof evaluateCoursePrerequisites>,
): TermPlacement["prerequisites"] {
  if (evaluation.state === "satisfied") return "met";
  return evaluation.state === "unsatisfied" ? "missing" : "unknown";
}

/**
 * The course placed in each term in turn, against the rest of the plan. A
 * course already planned is moved rather than counted twice.
 */
export function termPlacements({
  course,
  terms,
  attempts,
  catalogue,
}: {
  course: Course;
  terms: readonly Term[];
  attempts: Attempt[];
  catalogue: PlanningCatalogue;
}): TermPlacement[] {
  const existing = attempts.find(
    (attempt) => attempt.courseCode === course.code && isActiveAttempt(attempt),
  );
  const others = attempts.filter((attempt) => attempt.id !== existing?.id);
  return terms.map((term) => {
    const currentUnits = termLoad(
      attempts,
      term.id,
      existing?.id,
      catalogue,
    ).units;
    const unitsAfter = currentUnits + course.units;
    const placement = placementAttempt(course, term.id);
    const evaluation = evaluateCoursePrerequisites(
      placement,
      [...others, placement],
      catalogue,
    );
    return {
      term,
      // A course with no published sessions has not been scheduled yet, so
      // it is not ruled out of any term.
      offered:
        course.sessions.length === 0 || courseIsAvailable(course, term.name),
      currentUnits,
      unitsAfter,
      overload: unitsAfter > STANDARD_TERM_UNITS,
      needsPermission: unitsAfter > OVERLOAD_PERMISSION_UNITS,
      prerequisites: prerequisiteState(evaluation),
      missingCodes: evaluation.missingCodes,
    };
  });
}

/**
 * The term to offer first: one that runs the course, keeps a standard load
 * and has the prerequisites before it, then the first that fits the load,
 * then the first that runs it. Undefined when no term runs it.
 */
export function suggestedPlacement(placements: readonly TermPlacement[]) {
  const offered = placements.filter((placement) => placement.offered);
  return (
    offered.find(
      (placement) =>
        !placement.overload && placement.prerequisites !== "missing",
    ) ??
    offered.find((placement) => !placement.overload) ??
    offered[0]
  );
}

/**
 * Where a course not yet in the plan stands against everything done or
 * planned, wherever it might go: its prerequisites covered, one missing, a
 * rule Coursemap cannot check, or covered but needing permission to enrol.
 */
export type PlanPrerequisites = "met" | "missing" | "unknown" | "permission";

export function planPrerequisites(
  course: Course,
  attempts: Attempt[],
  catalogue: PlanningCatalogue,
): PlanPrerequisites {
  // A course found by search may not be in the catalogue the plan loaded,
  // and the check reads the course from there.
  const known = catalogue.courses.some(
    (item) => item.code === course.code && item.year === course.year,
  );
  const { state } = evaluateCoursePrerequisites(
    placementAttempt(course, ""),
    attempts,
    {
      ...catalogue,
      courses: known ? catalogue.courses : [...catalogue.courses, course],
      evaluationContext: "whole-plan",
    },
  );
  if (state === "unsatisfied") return "missing";
  if (state === "unknown") return "unknown";
  return course.permissionText?.trim() ? "permission" : "met";
}
