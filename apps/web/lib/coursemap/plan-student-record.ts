import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import type { Attempt, Profile } from "@/lib/coursemap/types";
import { planStructureCodes } from "@/lib/coursemap/plan-structure-codes";
import {
  isActiveAttempt,
  planningCourseForAttempt,
  termIndex,
  unitsForAttempt,
} from "@/lib/planner";

/**
 * The plan as a student record for one course's requisites: courses planned
 * or done before its semester count as completed, and ones beside it as
 * taken at the same time.
 */
export function planStudentRecord(
  attempt: Attempt,
  attempts: Attempt[],
  profile: Pick<
    Profile,
    "degreeCode" | "majorCode" | "minorCodes" | "specialisationCodes"
  >,
  commencementYear: number | null,
  catalogue?: PlanCatalogue,
): StudentRecord {
  const order = termIndex(attempt.termId, catalogue);
  const others = attempts.filter(
    (other) => other.id !== attempt.id && isActiveAttempt(other),
  );
  return {
    completed: new Map(
      others
        .filter((other) => termIndex(other.termId, catalogue) < order)
        .map((other) => {
          const course = planningCourseForAttempt(other, catalogue);
          return [
            other.courseCode.toUpperCase(),
            {
              units: unitsForAttempt(other, course),
              mark: other.mark ?? null,
              tags: course?.tags ?? [],
            },
          ];
        }),
    ),
    enrolled: new Set(
      others
        .filter((other) => termIndex(other.termId, catalogue) === order)
        .map((other) => other.courseCode.toUpperCase()),
    ),
    enrolledUnits: new Map(
      others
        .filter((other) => termIndex(other.termId, catalogue) === order)
        .map((other) => [
          other.courseCode.toUpperCase(),
          unitsForAttempt(other, planningCourseForAttempt(other, catalogue)),
        ]),
    ),
    commencementYear,
    enrolmentMode: catalogue?.enrolmentMode,
    programmeCodes: profile.degreeCode ? [profile.degreeCode] : [],
    programmeColleges: catalogue?.programmeColleges,
    programmeCareers: catalogue?.programmeCareers,
    structureCodes: planStructureCodes(profile),
    permissionApproved: attempt.permissionApproved ?? false,
    wam: null,
    gpa: null,
    studyYear: null,
  };
}
