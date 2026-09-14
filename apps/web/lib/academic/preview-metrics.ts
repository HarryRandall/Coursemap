import {
  formatMark,
  gradePointAverage,
  weightedAverageMark,
} from "@/lib/academic/metrics";

type Result = { mark?: number; resultCode?: string; units?: number };

// Preview fixtures are six-unit courses unless an explicit unit load is supplied.
function withUnits(results: readonly Result[]) {
  return results.map((result) => ({ ...result, units: result.units ?? 6 }));
}

export const formatPreviewMark = formatMark;

export function previewWam(results: Result[]) {
  return weightedAverageMark(withUnits(results));
}

export function previewGpa(results: Result[]) {
  return gradePointAverage(withUnits(results));
}
