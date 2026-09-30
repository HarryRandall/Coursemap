type CourseYearRow = { code: string; academic_year: number };

/** Show one published record per code, preferring 2026 when it exists. */
export function selectPreferredCourseYears<Row extends CourseYearRow>(
  rows: readonly Row[],
): Row[] {
  const byCode = new Map<string, Row>();
  for (const row of rows) {
    const current = byCode.get(row.code);
    if (
      !current ||
      (row.academic_year === 2026 && current.academic_year !== 2026) ||
      (current.academic_year !== 2026 &&
        row.academic_year > current.academic_year)
    ) {
      byCode.set(row.code, row);
    }
  }
  return [...byCode.values()];
}
