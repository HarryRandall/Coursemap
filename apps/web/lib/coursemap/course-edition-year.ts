import type { Course } from "@/lib/coursemap/types";

/**
 * The edition year nearest to `year`, preferring the earlier of two equally
 * near years. Null when there are no editions.
 */
export function closestEditionYear(
  year: number,
  editionYears: Iterable<number>,
): number | null {
  let closest: number | null = null;
  for (const edition of editionYears) {
    if (
      closest === null ||
      Math.abs(edition - year) < Math.abs(closest - year) ||
      (Math.abs(edition - year) === Math.abs(closest - year) &&
        edition < closest)
    ) {
      closest = edition;
    }
  }
  return closest;
}

/**
 * A course's edition for `year` among the courses given: that year's, or
 * the closest year's. Without a year, the first edition listed. Undefined
 * when no edition is listed.
 */
export function closestCourseEdition(
  courses: readonly Course[],
  code: string,
  year: number | null,
): Course | undefined {
  const editions = courses.filter((course) => course.code === code);
  if (year === null) return editions[0];
  const editionYear = closestEditionYear(
    year,
    editions.map((course) => course.year),
  );
  return editions.find((course) => course.year === editionYear);
}
