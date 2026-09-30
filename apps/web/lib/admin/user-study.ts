import type { AdminUserCourse, AdminUserStudy } from "@/lib/admin/users";
import type { DashboardTermPoint } from "@/lib/coursemap/dashboard-series";
import type { DegreeUnitProgress } from "@/lib/planner";

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

export function adminUserStudyProgress(
  study: AdminUserStudy,
): DegreeUnitProgress {
  const degreeUnits =
    study.structures.find((structure) => structure.role === "programme")
      ?.units ?? 0;
  const active = activeCourses(study.courses);
  const completed = active
    .filter(countsAsCompleted)
    .reduce((total, course) => total + (course.unitsEarned || course.units), 0);
  const planned = active
    .filter(countsAsPlanned)
    .reduce((total, course) => total + course.units, 0);
  const mapped = completed + planned;
  return {
    completed,
    planned,
    mapped,
    remaining: Math.max(0, degreeUnits - mapped),
    total: degreeUnits,
    percent:
      degreeUnits === 0 ? 0 : Math.round((completed / degreeUnits) * 100),
  };
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
      existing.completed += course.unitsEarned || course.units;
    } else {
      existing.planned += course.units;
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
