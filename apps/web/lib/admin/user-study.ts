import type { AdminUserCourse, AdminUserStudy } from "@/lib/admin/users";
import type { DashboardTermPoint } from "@/lib/coursemap/dashboard-series";
import type { Attempt } from "@/lib/coursemap/types";
import {
  degreeUnitProgressBy,
  unitsForAttempt,
  type DegreeUnitProgress,
} from "@/lib/planner";

function activeCourses(courses: readonly AdminUserCourse[]) {
  const byCode = new Map<string, AdminUserCourse>();
  courses.forEach((course) => byCode.set(course.code, course));
  return [...byCode.values()];
}

function countsAsCompleted(course: AdminUserCourse) {
  return course.status === "completed" || course.status === "credited";
}

function countsAsPlanned(course: AdminUserCourse) {
  return course.status === "planned" || course.status === "enrolled";
}

/**
 * The row as the student's plan loads it: credit counts as a completion and
 * a recorded row keeps the units saved on the attempt.
 */
function attemptForCourse(course: AdminUserCourse): Attempt {
  const recorded = course.status !== "planned";
  return {
    id: course.id,
    courseCode: course.code,
    termId:
      course.calendarYear !== null && course.periodCode !== null
        ? `${course.calendarYear}-${course.periodCode.toLowerCase()}`
        : "unscheduled",
    status: course.status === "credited" ? "completed" : course.status,
    ...(recorded
      ? { unitsAttempted: course.units, unitsEarned: course.unitsEarned }
      : {}),
  };
}

function courseUnits(course: AdminUserCourse) {
  return unitsForAttempt(attemptForCourse(course), { units: course.units });
}

export function adminUserStudyProgress(
  study: AdminUserStudy,
): DegreeUnitProgress {
  const degreeUnits =
    study.structures.find((structure) => structure.role === "programme")
      ?.units ?? 0;
  // The student's view orders planned items before recorded attempts.
  const ordered = [
    ...study.courses.filter((course) => course.status === "planned"),
    ...study.courses.filter((course) => course.status !== "planned"),
  ];
  const unitsById = new Map(ordered.map((course) => [course.id, course.units]));
  return degreeUnitProgressBy(
    ordered.map(attemptForCourse),
    degreeUnits,
    (attempt) =>
      unitsForAttempt(attempt, { units: unitsById.get(attempt.id) ?? 0 }),
  );
}

export function adminUserTermLoads(
  courses: readonly AdminUserCourse[],
): DashboardTermPoint[] {
  const grouped = new Map<string, DashboardTermPoint>();

  activeCourses(courses).forEach((course) => {
    if (
      course.calendarYear === null ||
      course.periodCode === null ||
      (!countsAsCompleted(course) && !countsAsPlanned(course))
    ) {
      return;
    }
    const id = `${course.calendarYear}-${course.periodCode.toLowerCase()}`;
    const shortName = course.periodShortName ?? course.periodCode;
    const existing = grouped.get(id) ?? {
      id,
      label: `${shortName} '${String(course.calendarYear).slice(-2)}`,
      year: course.calendarYear,
      isSemester: /^S[12]$/u.test(course.periodCode.toUpperCase()),
      completed: 0,
      planned: 0,
      units: 0,
    };
    if (countsAsCompleted(course)) {
      existing.completed += courseUnits(course);
    } else {
      existing.planned += courseUnits(course);
    }
    existing.units = existing.completed + existing.planned;
    grouped.set(id, existing);
  });

  return [...grouped.values()].toSorted(
    (left, right) => left.year - right.year || left.id.localeCompare(right.id),
  );
}

export function uniqueTrackedCourseCount(courses: readonly AdminUserCourse[]) {
  return new Set(courses.map((course) => course.code)).size;
}
