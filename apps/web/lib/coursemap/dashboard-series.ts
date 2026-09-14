import type { Accent, Attempt, Course, Term } from "@/lib/coursemap/types";
import {
  isActiveAttempt,
  planningCourseForAttempt,
  unitsForAttempt,
} from "@/lib/planner";

type DashboardCatalogue = {
  courses: readonly Course[];
  snapshotCourses?: readonly Course[];
  terms: readonly Term[];
};

export type DashboardTermPoint = {
  id: string;
  label: string;
  year: number;
  completed: number;
  planned: number;
  units: number;
};

export type DashboardCalendarEvent = {
  courseCode: string;
  accent: Accent;
  termId: string;
  termName: string;
  startsOn?: string;
  endsOn?: string;
};

function scheduledTerms(terms: readonly Term[]) {
  return terms.filter((term) => term.id !== "unscheduled");
}

export function termLabel(term: Term) {
  const semester = term.id.split("-").at(-1)?.toUpperCase();
  return semester?.match(/^S[12]$/)
    ? `${semester} '${String(term.year).slice(2)}`
    : `${term.shortName} ${String(term.year).slice(2)}`;
}

/**
 * Uses the same last-record-wins behaviour as degree progress, so a recorded
 * result supersedes an earlier planned entry for the same course.
 */
function activeAttempts(attempts: readonly Attempt[]) {
  const byCourse = new Map<string, Attempt>();
  attempts
    .filter(isActiveAttempt)
    .forEach((attempt) => byCourse.set(attempt.courseCode, attempt));
  return [...byCourse.values()];
}

export function dashboardTermLoads({
  attempts,
  courses,
  snapshotCourses,
  terms,
}: DashboardCatalogue & {
  attempts: readonly Attempt[];
}): DashboardTermPoint[] {
  const catalogue = { courses, snapshotCourses, terms };
  const active = activeAttempts(attempts);
  return scheduledTerms(terms).map((term) => {
    const inTerm = active
      .filter((attempt) => attempt.termId === term.id)
      .flatMap((attempt) => {
        const course = planningCourseForAttempt(attempt, catalogue);
        return course ? [{ attempt, course }] : [];
      });
    const completed = inTerm
      .filter(({ attempt }) => attempt.status === "completed")
      .reduce(
        (total, { attempt, course }) =>
          total + unitsForAttempt(attempt, course),
        0,
      );
    const planned = inTerm
      .filter(({ attempt }) => attempt.status !== "completed")
      .reduce(
        (total, { attempt, course }) =>
          total + unitsForAttempt(attempt, course),
        0,
      );
    return {
      id: term.id,
      label: termLabel(term),
      year: term.year,
      completed,
      planned,
      units: completed + planned,
    };
  });
}

export function cumulativeDashboardUnits(
  loads: readonly DashboardTermPoint[],
): DashboardTermPoint[] {
  let completed = 0;
  let planned = 0;
  return loads.map((load) => {
    completed += load.completed;
    planned += load.planned;
    return {
      ...load,
      completed,
      planned,
      units: completed + planned,
    };
  });
}

export function dashboardCalendarEvents({
  attempts,
  courses,
  snapshotCourses,
  terms,
}: DashboardCatalogue & {
  attempts: readonly Attempt[];
}): DashboardCalendarEvent[] {
  const catalogue = { courses, snapshotCourses, terms };
  const termsById = new Map(terms.map((term) => [term.id, term]));
  return activeAttempts(attempts).flatMap((attempt) => {
    const course = planningCourseForAttempt(attempt, catalogue);
    const term = termsById.get(attempt.termId);
    if (!course || !term || term.id === "unscheduled") return [];
    return [
      {
        courseCode: course.code,
        accent: course.accent,
        termId: term.id,
        termName: `${term.name} ${term.year}`,
        startsOn: term.startsOn,
        endsOn: term.endsOn,
      },
    ];
  });
}

export function currentDashboardTermId(
  terms: readonly Term[],
  today = new Date(),
) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return scheduledTerms(terms).find((term) => {
    if (!term.startsOn || !term.endsOn) return false;
    const start = new Date(`${term.startsOn}T00:00:00`);
    const end = new Date(`${term.endsOn}T23:59:59`);
    return day >= start && day <= end;
  })?.id;
}
