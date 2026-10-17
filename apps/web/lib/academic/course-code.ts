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

/**
 * Whether a course sits at a printed level. A round thousand names the first
 * digit, while a level such as 6100 names a narrower band of course numbers,
 * as in "1000 or 6100 level LAWS courses".
 */
export function courseMatchesLevel(code: string, level: number): boolean {
  const match = COURSE_CODE.exec(code);
  if (!match || !Number.isInteger(level) || level < 0) return false;
  const number = Number(code.slice(4, 8));
  const band =
    level % 1000 === 0
      ? 1000
      : level % 100 === 0
        ? 100
        : level % 10 === 0
          ? 10
          : 1;
  return Math.floor(number / band) * band === level;
}

/** Subject and level filters on a course count or unit total; null means any. */
export type CourseFilter = {
  subjectCodes: readonly string[] | null;
  courseLevels: readonly number[] | null;
};

export function courseMatchesFilter(code: string, filter: CourseFilter) {
  const subject = courseSubjectForCode(code);
  if (subject === null) return false;
  if (filter.subjectCodes && !filter.subjectCodes.includes(subject))
    return false;
  return (
    !filter.courseLevels ||
    filter.courseLevels.some((level) => courseMatchesLevel(code, level))
  );
}

function listWithOr(values: readonly (string | number)[]) {
  const items = values.map(String);
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/** "LAWS courses at 1000 or 6100 level", or "courses" with no filter. */
export function courseFilterLabel(filter: CourseFilter, isSingular = false) {
  const noun = isSingular ? "course" : "courses";
  const subjects = filter.subjectCodes?.length
    ? `${listWithOr(filter.subjectCodes)} `
    : "";
  const levels = filter.courseLevels?.length
    ? ` at ${listWithOr(filter.courseLevels)} level`
    : "";
  return `${subjects}${noun}${levels}`;
}
