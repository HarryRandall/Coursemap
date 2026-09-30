export const COURSE_LEVELS = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
] as const;

const COURSE_CODE = /^([A-Z]{4})(\d)\d{3}[A-Z]?$/u;

/** The first digit identifies the level, including ANU's suffixed codes. */
export function courseLevelForCode(code: string): number | null {
  const match = COURSE_CODE.exec(code);
  return match ? Number(match[2]) * 1000 : null;
}

/** The four-letter prefix is the subject, whether or not the course is imported. */
export function courseSubjectForCode(code: string): string | null {
  return COURSE_CODE.exec(code)?.[1] ?? null;
}
