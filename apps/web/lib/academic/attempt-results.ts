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

export type DatedAcademicResult = MarkedResult & {
  periodStartsOn: string | null;
};

/** A tied grade may have several course loads; choose one exact unit total. */
function equalGradeUnitSubset(
  results: readonly DatedAcademicResult[],
  targetUnits: number,
): DatedAcademicResult[] | null {
  const scaledTarget = Math.round(targetUnits * 100);
  if (Math.abs(scaledTarget - targetUnits * 100) > 0.000001) return null;
  const byUnits = new Map<number, DatedAcademicResult[]>([[0, []]]);
  for (const result of results) {
    const scaledUnits = Math.round(result.units * 100);
    if (Math.abs(scaledUnits - result.units * 100) > 0.000001) return null;
    for (const [units, subset] of [...byUnits]) {
      const total = units + scaledUnits;
      if (total <= scaledTarget && !byUnits.has(total))
        byUnits.set(total, [...subset, result]);
    }
  }
  return byUnits.get(scaledTarget) ?? null;
}

/** Returns null when the specified graded-unit window cannot be established. */
export function recentGradedAverage(
  results: readonly DatedAcademicResult[],
  targetUnits: number,
  scale: "gpa" | "wam",
): number | null {
  if (!Number.isInteger(targetUnits) || targetUnits < 1 || targetUnits > 300)
    return null;
  const score = scale === "gpa" ? gradePointAverage : weightedAverageMark;
  const graded = results.filter(
    (result) => score([{ ...result, units: 1 }]) !== null,
  );
  if (
    graded.some(
      (result) =>
        result.units <= 0 ||
        !result.periodStartsOn ||
        !/^\d{4}-\d{2}-\d{2}$/.test(result.periodStartsOn),
    )
  )
    return null;
  const ordered = [...graded].sort((a, b) =>
    b.periodStartsOn!.localeCompare(a.periodStartsOn!),
  );
  const selected: DatedAcademicResult[] = [];
  let selectedUnits = 0;
  let periodsSeen = 0;
  for (let index = 0; index < ordered.length;) {
    const period = ordered[index].periodStartsOn;
    const inPeriod: DatedAcademicResult[] = [];
    while (index < ordered.length && ordered[index].periodStartsOn === period)
      inPeriod.push(ordered[index++]);
    periodsSeen += 1;
    const periodUnits = inPeriod.reduce((sum, result) => sum + result.units, 0);
    if (selectedUnits + periodUnits <= targetUnits) {
      selected.push(...inPeriod);
      selectedUnits += periodUnits;
    } else {
      // The source specifies highest grades in the earliest semester only
      // when the window reaches at least three semesters.
      if (periodsSeen < 3) return null;
      inPeriod.sort(
        (a, b) => score([{ ...b, units: 1 }])! - score([{ ...a, units: 1 }])!,
      );
      for (let offset = 0; offset < inPeriod.length;) {
        const grade = score([{ ...inPeriod[offset], units: 1 }])!;
        const tied: DatedAcademicResult[] = [];
        while (
          offset < inPeriod.length &&
          score([{ ...inPeriod[offset], units: 1 }]) === grade
        )
          tied.push(inPeriod[offset++]);
        const tiedUnits = tied.reduce((sum, result) => sum + result.units, 0);
        if (selectedUnits + tiedUnits <= targetUnits) {
          selected.push(...tied);
          selectedUnits += tiedUnits;
        } else {
          const subset = equalGradeUnitSubset(
            tied,
            targetUnits - selectedUnits,
          );
          if (!subset) return null;
          selected.push(...subset);
          selectedUnits = targetUnits;
        }
        if (selectedUnits === targetUnits) break;
      }
    }
    if (selectedUnits === targetUnits) return score(selected);
  }
  return null;
}
