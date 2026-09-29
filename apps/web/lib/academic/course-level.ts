export const COURSE_LEVELS = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
] as const;

/** The first digit identifies the level, including ANU's suffixed codes. */
export function courseLevelForCode(code: string): number | null {
  const match = /^[A-Z]{4}(\d)\d{3}[A-Z]?$/.exec(code);
  return match ? Number(match[1]) * 1000 : null;
}
