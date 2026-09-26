/**
 * Canonical mark arithmetic. The academic previews and the dashboard both read
 * from here, so a WAM shown in one place matches the other.
 */

export type MarkedResult = {
  mark?: number;
  resultCode?: string;
  units: number;
};

/** ANU grade bands, highest first. A mark takes the first band it clears. */
const GRADE_BANDS = [
  { code: "HD", label: "High distinction", floor: 80 },
  { code: "D", label: "Distinction", floor: 70 },
  { code: "CR", label: "Credit", floor: 60 },
  { code: "P", label: "Pass", floor: 50 },
  { code: "N", label: "Fail", floor: 0 },
] as const;

export type GradeBand = (typeof GRADE_BANDS)[number];
export type GradeCode = GradeBand["code"];

export const gradeBands: readonly GradeBand[] = GRADE_BANDS;

function bandForMark(mark: number): GradeBand {
  return (
    GRADE_BANDS.find((band) => mark >= band.floor) ??
    GRADE_BANDS[GRADE_BANDS.length - 1]
  );
}

export function formatMark(mark: number) {
  return Number(mark.toFixed(1)).toString();
}

export function gradeForMark(mark: number): GradeCode {
  return bandForMark(mark).code;
}

/** The band a WAM sits in, for labelling — "Distinction", "Credit". */
export function bandLabelForMark(mark: number) {
  return bandForMark(mark).label;
}

export function weightedAverageMark(results: readonly MarkedResult[]) {
  const marked = results.filter((result) => result.mark !== undefined);
  const units = marked.reduce((sum, result) => sum + result.units, 0);
  return units
    ? marked.reduce((sum, result) => sum + result.mark! * result.units, 0) /
        units
    : null;
}

/** Grade points for result codes that carry them without a mark. */
const CODE_POINTS: Record<string, number> = {
  HD: 7,
  D: 6,
  CR: 5,
  P: 4,
  PS: 4,
  N: 0,
  NCN: 0,
  WN: 0,
};

// ANU: https://www.anu.edu.au/students/program-administration/assessments-exams/grade-point-average-gpa
export function gradePointAverage(results: readonly MarkedResult[]) {
  const included = results.flatMap((result) => {
    let points: number;
    const code = result.resultCode?.toUpperCase();
    // A recorded mark decides the grade; the code covers results without one.
    if (result.mark === undefined && code && code in CODE_POINTS)
      points = CODE_POINTS[code];
    else if (code === "PS") points = 4;
    else if (code === "NCN" || code === "WN") points = 0;
    else if ((code && !(code in CODE_POINTS)) || result.mark === undefined)
      return [];
    else
      points =
        result.mark >= 80
          ? 7
          : result.mark >= 70
            ? 6
            : result.mark >= 60
              ? 5
              : result.mark >= 50
                ? 4
                : 0;
    return [{ points, units: result.units }];
  });
  const units = included.reduce((sum, result) => sum + result.units, 0);
  return units
    ? included.reduce((sum, result) => sum + result.points * result.units, 0) /
        units
    : null;
}
