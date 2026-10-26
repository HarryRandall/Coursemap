import "server-only";
import { createPublicClient } from "@/lib/supabase/public-server";
import { loadPublishedCoursesBySelections } from "@/lib/coursemap/published-courses";
import { closestEditionYear } from "@/lib/coursemap/course-edition-year";

/** Resolve planning selections without inventing catalogue editions for future years. */
export async function loadPlanningCourseEditions(
  selections: readonly { code: string; year: number }[],
) {
  if (selections.length === 0) return [];
  const client = createPublicClient();
  const { data, error } = await client
    .from("published_course_summaries")
    .select("code,academic_year")
    .in("code", [...new Set(selections.map(({ code }) => code))]);
  if (error) throw error;
  const resolved = selections.flatMap(({ code, year }) => {
    const years = (data ?? [])
      .filter((edition) => edition.code === code)
      .flatMap((edition) =>
        edition.academic_year === null ? [] : [edition.academic_year],
      )
      .sort((left, right) => left - right);
    const editionYear =
      years.findLast((edition) => edition <= year) ?? years[0];
    return editionYear === undefined ? [] : [{ code, year: editionYear }];
  });
  return loadPublishedCoursesBySelections(resolved);
}

/**
 * Each course's edition from the published year nearest to `year`, the
 * earlier of two equally near. Codes no year publishes are left out.
 */
export async function loadClosestCourseEditions(
  codes: readonly string[],
  year: number,
) {
  if (codes.length === 0) return [];
  const { data, error } = await createPublicClient()
    .from("published_course_summaries")
    .select("code,academic_year")
    .in("code", [...new Set(codes)]);
  if (error) throw error;
  const yearsByCode = new Map<string, number[]>();
  for (const { code, academic_year: editionYear } of data ?? []) {
    if (code === null || editionYear === null) continue;
    yearsByCode.set(code, [...(yearsByCode.get(code) ?? []), editionYear]);
  }
  return loadPublishedCoursesBySelections(
    [...yearsByCode].flatMap(([code, years]) => {
      const editionYear = closestEditionYear(year, years);
      return editionYear === null ? [] : [{ code, year: editionYear }];
    }),
  );
}
