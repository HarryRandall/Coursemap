import {
  bandLabelForMark,
  gradeBands,
  gradeForMark,
  type GradeCode,
  type MarkedResult,
} from "@/lib/academic/metrics";
import { termLabel } from "@/lib/coursemap/dashboard-series";
import {
  academicResultUnits,
  isRecordedAcademicAttempt,
  recordedGradePointAverage,
  recordedWeightedAverageMark,
} from "@/lib/academic/attempt-results";
import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import { isActiveAttempt, planningCourseForAttempt } from "@/lib/planner";

type AcademicCatalogue = {
  courses: readonly Course[];
  snapshotCourses?: readonly Course[];
  terms: readonly Term[];
};

type AcademicInputs = AcademicCatalogue & { attempts: readonly Attempt[] };

type ResultRow = MarkedResult & { termId: string; courseCode: string };

/** Each recorded attempt contributes to averages, including earlier failed repeats. */
function resultRows({
  attempts,
  courses,
  snapshotCourses,
}: Omit<AcademicInputs, "terms">): ResultRow[] {
  const catalogue = { courses, snapshotCourses, terms: [] };
  return attempts.filter(isRecordedAcademicAttempt).flatMap((attempt) => {
    if (attempt.mark === undefined && attempt.resultCode === undefined)
      return [];
    const course = planningCourseForAttempt(attempt, catalogue);
    const units = academicResultUnits(attempt, course?.units);
    return [
      {
        mark: attempt.mark,
        resultCode: attempt.resultCode,
        units,
        termId: attempt.termId,
        courseCode: attempt.courseCode,
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
  wam: number | null;
  /** Null when no result in the period carries grade points. */
  gpa: number | null;
  units: number;
  courses: number;
  /** Each marked course in the period, in course code order. */
  marks: { code: string; mark: number }[];
};

/** One point per teaching period with a WAM or GPA, oldest first. */
export function academicTermPoints(
  inputs: AcademicInputs,
): AcademicTermPoint[] {
  const rows = resultRows(inputs);
  return inputs.terms
    .filter((term) => term.id !== "unscheduled")
    .flatMap((term) => {
      const inTerm = rows.filter((row) => row.termId === term.id);
      const wam = recordedWeightedAverageMark(inTerm);
      const gpa = recordedGradePointAverage(inTerm);
      if (wam === null && gpa === null) return [];
      return [
        {
          id: term.id,
          label: termLabel(term),
          year: term.year,
          wam,
          gpa,
          units: inTerm.reduce((sum, row) => sum + row.units, 0),
          courses: inTerm.length,
          marks: inTerm
            .flatMap((row) =>
              row.mark === undefined
                ? []
                : [{ code: row.courseCode, mark: row.mark }],
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
  const wam = recordedWeightedAverageMark(rows);
  const points = academicTermPoints(inputs).flatMap((point) =>
    point.wam === null ? [] : [{ ...point, wam: point.wam }],
  );
  const [previous, latest] = points.slice(-2);
  return {
    wam,
    gpa: recordedGradePointAverage(rows),
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
