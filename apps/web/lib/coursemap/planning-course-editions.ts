import "server-only";
import { createPublicClient } from "@/lib/supabase/public-server";
import { loadPublishedCoursesBySelections } from "@/lib/coursemap/published-courses";

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
