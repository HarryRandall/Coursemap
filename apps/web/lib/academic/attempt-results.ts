import type { Attempt } from "../coursemap/types.ts";
import {
  gradePointAverage,
  weightedAverageMark,
  type MarkedResult,
} from "./metrics.ts";

/** Failed and withdrawn results can carry grade points, unlike future plans. */
export function isRecordedAcademicAttempt(attempt: Attempt): boolean {
  return (
    attempt.status === "completed" ||
    attempt.status === "failed" ||
    attempt.status === "withdrawn"
  );
}

/** Academic averages use the load attempted, including units that earned no credit. */
export function academicResultUnits(
  attempt: Pick<Attempt, "unitsAttempted" | "unitsEarned">,
  fallbackUnits = 0,
): number {
  for (const units of [
    attempt.unitsAttempted,
    attempt.unitsEarned,
    fallbackUnits,
  ]) {
    if (units !== undefined && Number.isFinite(units) && units > 0)
      return units;
  }
  return 0;
}

/** An incomplete recorded load cannot prove an academic average requirement. */
export function recordedGradePointAverage(results: readonly MarkedResult[]) {
  if (
    results.some(
      (result) =>
        result.units === 0 &&
        gradePointAverage([{ ...result, units: 1 }]) !== null,
    )
  )
    return null;
  return gradePointAverage(results);
}

export function recordedWeightedAverageMark(results: readonly MarkedResult[]) {
  if (results.some((result) => result.units === 0 && result.mark !== undefined))
    return null;
  return weightedAverageMark(results);
}
