import "server-only";
import type { AdminCourseList } from "@/lib/catalogue/course-lists";
import { createClient } from "@/lib/supabase/server";

/** Every course list for one academic year, ordered by name. */
export async function loadAdminCourseLists(
  year: number,
): Promise<AdminCourseList[]> {
  const supabase = await createClient();
  const { data: academicYear, error: yearError } = await supabase
    .from("academic_years")
    .select("id")
    .eq("year", year)
    .maybeSingle();
  if (yearError) throw yearError;
  if (!academicYear) return [];

  const { data: lists, error: listsError } = await supabase
    .from("course_lists")
    .select("id,name,source_url,published_at,course_list_members(state,code)")
    .eq("academic_year_id", academicYear.id)
    .order("name");
  if (listsError) throw listsError;

  const draftCodes = [
    ...new Set(
      (lists ?? []).flatMap((list) =>
        list.course_list_members
          .filter((member) => member.state === "draft")
          .map((member) => member.code),
      ),
    ),
  ];
  const { data: listings, error: listingsError } = draftCodes.length
    ? await supabase
        .from("catalogue_listings")
        .select("code")
        .eq("academic_year_id", academicYear.id)
        .eq("kind", "course")
        .in("code", draftCodes)
    : { data: [], error: null };
  if (listingsError) throw listingsError;
  const listed = new Set((listings ?? []).map((row) => row.code));

  return (lists ?? []).map((list) => {
    const codes = (state: string) =>
      list.course_list_members
        .filter((member) => member.state === state)
        .map((member) => member.code)
        .sort();
    const draft = codes("draft");
    return {
      id: list.id,
      name: list.name,
      sourceUrl: list.source_url,
      publishedAt: list.published_at,
      draftCodes: draft,
      publishedCodes: codes("published"),
      unlistedCodes: draft.filter((code) => !listed.has(code)),
    };
  });
}

/** Registered academic years, for the year picker. */
export async function loadCourseListYears(): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("year")
    .order("year", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.year);
}
