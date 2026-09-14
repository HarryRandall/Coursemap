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
import type { CourseFee } from "@/lib/coursemap/course-types";
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
  units: number;
  courses: number;
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
          units: inTerm.reduce((sum, row) => sum + row.units, 0),
          courses: inTerm.length,
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

/** 48 units is one full-time equivalent year at ANU. */
const UNITS_PER_EFTSL = 48;

/** Preferred fee types, most specific first. */
const FEE_TYPE_ORDER = ["student_contribution", "tuition", "indicative"];

/**
 * Published fees keyed by course code.
 *
 * Fees live on CourseDetails, not on the planning Course, so the caller has to
 * supply them. Passing an empty lookup yields null and the caller shows an
 * empty state — which is the honest result until fee data is loaded for a plan.
 */
export type CourseFeeLookup = ReadonlyMap<string, readonly CourseFee[]>;

export type TuitionEstimate = {
  total: number;
  currency: string;
  audience: string;
  /** Courses in the plan that carry a usable published fee. */
  pricedCourses: number;
  plannedCourses: number;
  /** Latest fee year contributing to the estimate. */
  feeYear: number | null;
};

function feeAmountFor(
  fees: readonly CourseFee[],
  units: number,
  audience: string,
) {
  const fee = fees
    .filter(
      (item) =>
        item.amount !== null &&
        item.audience === audience &&
        FEE_TYPE_ORDER.includes(item.feeType),
    )
    .sort(
      (a, b) =>
        FEE_TYPE_ORDER.indexOf(a.feeType) - FEE_TYPE_ORDER.indexOf(b.feeType),
    )
    .at(0);
  if (!fee || fee.amount === null) return null;
  // Annual and unknown bases cannot be attributed to a single course.
  if (fee.basis === "course") return { amount: fee.amount, fee };
  if (fee.basis === "unit") return { amount: fee.amount * units, fee };
  if (fee.basis === "eftsl")
    return { amount: (fee.amount * units) / UNITS_PER_EFTSL, fee };
  return null;
}

/**
 * Sums published fees across every course in the plan. Returns null when no
 * course has a usable fee, so the caller shows an empty state rather than a
 * misleading zero.
 */
export function tuitionEstimate({
  attempts,
  courses,
  snapshotCourses,
  fees,
  audience = "domestic",
}: Omit<AcademicInputs, "terms"> & {
  fees: CourseFeeLookup;
  audience?: string;
}): TuitionEstimate | null {
  const catalogue = { courses, snapshotCourses, terms: [] };
  const planned = attempts.filter(isActiveAttempt).flatMap((attempt) => {
    const course = planningCourseForAttempt(attempt, catalogue);
    return course ? [{ attempt, course }] : [];
  });
  let total = 0;
  let pricedCourses = 0;
  let currency = "AUD";
  let feeYear: number | null = null;
  planned.forEach(({ attempt, course }) => {
    const priced = feeAmountFor(
      fees.get(course.code) ?? [],
      unitsForAttempt(attempt, course),
      audience,
    );
    if (!priced) return;
    total += priced.amount;
    pricedCourses += 1;
    currency = priced.fee.currency ?? currency;
    if (priced.fee.feeYear !== null)
      feeYear = Math.max(feeYear ?? priced.fee.feeYear, priced.fee.feeYear);
  });
  if (pricedCourses === 0) return null;
  return {
    total,
    currency,
    audience,
    pricedCourses,
    plannedCourses: planned.length,
    feeYear,
  };
}
