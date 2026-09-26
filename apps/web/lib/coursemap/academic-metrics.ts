import {
  bandLabelForMark,
  gradeBands,
  gradeForMark,
  gradePointAverage,
  weightedAverageMark,
  type GradeCode,
  type MarkedResult,
} from "@/lib/academic/metrics";
import { termLabel } from "@/lib/coursemap/dashboard-series";
import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import {
  isActiveAttempt,
  planningCourseForAttempt,
  unitsForAttempt,
} from "@/lib/planner";

type AcademicCatalogue = {
  courses: readonly Course[];
  snapshotCourses?: readonly Course[];
  terms: readonly Term[];
};

type AcademicInputs = AcademicCatalogue & { attempts: readonly Attempt[] };

type ResultRow = MarkedResult & { termId: string; course: Course };

/**
 * Attempts carrying a result, de-duplicated with the same last-record-wins rule
 * as degree progress so a recorded mark supersedes an earlier planned entry.
 */
function resultRows({
  attempts,
  courses,
  snapshotCourses,
}: Omit<AcademicInputs, "terms">): ResultRow[] {
  const catalogue = { courses, snapshotCourses, terms: [] };
  const byCourse = new Map<string, Attempt>();
  attempts
    .filter(isActiveAttempt)
    .forEach((attempt) => byCourse.set(attempt.courseCode, attempt));
  return [...byCourse.values()].flatMap((attempt) => {
    if (attempt.mark === undefined && attempt.resultCode === undefined)
      return [];
    const course = planningCourseForAttempt(attempt, catalogue);
    if (!course) return [];
    return [
      {
        mark: attempt.mark,
        resultCode: attempt.resultCode,
        units: unitsForAttempt(attempt, course),
        termId: attempt.termId,
        course,
      },
    ];
  });
}

/* ------------------------------------------------------------------ */
/* WAM over time                                                       */
/* ------------------------------------------------------------------ */

export type AcademicTermPoint = {
  id: string;
  label: string;
  year: number;
  wam: number;
  /** Null when no result in the period carries grade points. */
  gpa: number | null;
  units: number;
  courses: number;
  /** Each marked course in the period, in course code order. */
  marks: { code: string; mark: number }[];
};

/** One point per teaching period that has at least one mark, oldest first. */
export function academicTermPoints(
  inputs: AcademicInputs,
): AcademicTermPoint[] {
  const rows = resultRows(inputs);
  return inputs.terms
    .filter((term) => term.id !== "unscheduled")
    .flatMap((term) => {
      const inTerm = rows.filter((row) => row.termId === term.id);
      const wam = weightedAverageMark(inTerm);
      if (wam === null) return [];
      return [
        {
          id: term.id,
          label: termLabel(term),
          year: term.year,
          wam,
          gpa: gradePointAverage(inTerm),
          units: inTerm.reduce((sum, row) => sum + row.units, 0),
          courses: inTerm.length,
          marks: inTerm
            .flatMap((row) =>
              row.mark === undefined
                ? []
                : [{ code: row.course.code, mark: row.mark }],
            )
            .sort((a, b) => a.code.localeCompare(b.code)),
        },
      ];
    });
}

/* ------------------------------------------------------------------ */
/* Headline figures                                                    */
/* ------------------------------------------------------------------ */

export type AcademicSummary = {
  wam: number | null;
  gpa: number | null;
  /** "Distinction", "Credit" — the band the WAM sits in. */
  band: string | null;
  markedUnits: number;
  markedCourses: number;
  /** WAM movement against the previous graded teaching period. */
  delta: number | null;
};

export function academicSummary(inputs: AcademicInputs): AcademicSummary {
  const rows = resultRows(inputs);
  const wam = weightedAverageMark(rows);
  const points = academicTermPoints(inputs);
  const [previous, latest] = points.slice(-2);
  return {
    wam,
    gpa: gradePointAverage(rows),
    band: wam === null ? null : bandLabelForMark(wam),
    markedUnits: rows.reduce((sum, row) => sum + row.units, 0),
    markedCourses: rows.length,
    delta:
      previous && latest && points.length > 1
        ? latest.wam - previous.wam
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Grade mix                                                           */
/* ------------------------------------------------------------------ */

export type GradeTally = { code: GradeCode; label: string; count: number };

/** Every band is returned, including empty ones, so the chart keeps its shape. */
export function gradeDistribution(inputs: AcademicInputs): GradeTally[] {
  const marks = resultRows(inputs).flatMap((row) =>
    row.mark === undefined ? [] : [gradeForMark(row.mark)],
  );
  return gradeBands.map((band) => ({
    code: band.code,
    label: band.label,
    count: marks.filter((code) => code === band.code).length,
  }));
}

/* ------------------------------------------------------------------ */
/* Tuition                                                             */
/* ------------------------------------------------------------------ */

export type TuitionEstimate = {
  total: number;
  /** Courses in the plan that carry a published domestic fee. */
  pricedCourses: number;
  plannedCourses: number;
  /** Estimated fees per study year, oldest first. */
  byYear: { year: number; amount: number; courses: number }[];
};

/**
 * Sums each plan course's published domestic fee, as listed. Returns null when
 * no course has one, so the caller shows an empty state rather than a
 * misleading zero.
 */
export function tuitionEstimate({
  attempts,
  courses,
  snapshotCourses,
}: Omit<AcademicInputs, "terms">): TuitionEstimate | null {
  const catalogue = { courses, snapshotCourses, terms: [] };
  const planned = attempts.filter(isActiveAttempt).flatMap((attempt) => {
    const course = planningCourseForAttempt(attempt, catalogue);
    return course ? [{ attempt, course }] : [];
  });
  let total = 0;
  let pricedCourses = 0;
  const byYear = new Map<number, { amount: number; courses: number }>();
  planned.forEach(({ attempt, course }) => {
    const amount = course.domesticFee;
    if (amount === null || amount === undefined) return;
    total += amount;
    pricedCourses += 1;
    const year = Number(attempt.termId.slice(0, 4)) || attempt.academicYear;
    if (year) {
      const entry = byYear.get(year) ?? { amount: 0, courses: 0 };
      byYear.set(year, {
        amount: entry.amount + amount,
        courses: entry.courses + 1,
      });
    }
  });
  if (pricedCourses === 0) return null;
  return {
    total,
    pricedCourses,
    plannedCourses: planned.length,
    byYear: [...byYear]
      .sort(([a], [b]) => a - b)
      .map(([year, entry]) => ({ year, ...entry })),
  };
}
