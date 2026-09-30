import "server-only";
import type {
  AdminCourseList,
  AdminCourseListsYear,
  CourseListTemplate,
  WaitingCourseList,
} from "@/lib/catalogue/course-lists";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type MemberRow = { state: string; code: string };

function memberCodes(members: MemberRow[], state: string) {
  return members
    .filter((member) => member.state === state)
    .map((member) => member.code)
    .sort();
}

/** One year's lists, the tags its rules still wait for and the latest earlier year's lists. */
export async function loadAdminCourseListsYear(
  year: number,
): Promise<AdminCourseListsYear> {
  const supabase = await createClient();
  const { data: academicYear, error: yearError } = await supabase
    .from("academic_years")
    .select("id")
    .eq("year", year)
    .maybeSingle();
  if (yearError) throw yearError;
  const previous = await loadPreviousLists(supabase, year);
  if (!academicYear) return { lists: [], waiting: [], previous };

  const { data: rows, error: listsError } = await supabase
    .from("course_lists")
    .select("id,name,source_url,published_at,course_list_members(state,code)")
    .eq("academic_year_id", academicYear.id)
    .order("name");
  if (listsError) throw listsError;

  const draftCodes = [
    ...new Set(
      (rows ?? []).flatMap((list) =>
        memberCodes(list.course_list_members, "draft"),
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

  const lists: AdminCourseList[] = (rows ?? []).map((list) => {
    const draft = memberCodes(list.course_list_members, "draft");
    return {
      id: list.id,
      name: list.name,
      sourceUrl: list.source_url,
      publishedAt: list.published_at,
      draftCodes: draft,
      publishedCodes: memberCodes(list.course_list_members, "published"),
      unlistedCodes: draft.filter((code) => !listed.has(code)),
    };
  });
  const waiting = await loadWaitingLists(
    supabase,
    academicYear.id,
    lists.map((list) => list.name),
  );
  return { lists, waiting, previous };
}

async function loadPreviousLists(
  supabase: Supabase,
  year: number,
): Promise<AdminCourseListsYear["previous"]> {
  const { data, error } = await supabase
    .from("course_lists")
    .select(
      "name,source_url,academic_years!inner(year),course_list_members(state,code)",
    )
    .lt("academic_years.year", year)
    .order("name");
  if (error) throw error;
  if (!data?.length) return null;
  const latest = Math.max(...data.map((row) => row.academic_years.year));
  const lists: CourseListTemplate[] = data
    .filter((row) => row.academic_years.year === latest)
    .map((row) => {
      const published = memberCodes(row.course_list_members, "published");
      return {
        name: row.name,
        sourceUrl: row.source_url,
        codes: published.length
          ? published
          : memberCodes(row.course_list_members, "draft"),
      };
    });
  return { year: latest, lists };
}

/**
 * Tags counted by the year's published or newest imported structure rules
 * that neither a list nor a published course tag supplies.
 */
async function loadWaitingLists(
  supabase: Supabase,
  academicYearId: number,
  listNames: string[],
): Promise<WaitingCourseList[]> {
  const { data: records, error: recordsError } = await supabase
    .from("catalogue_records")
    .select("code_id,published_version_id,latest_source_version_id")
    .eq("academic_year_id", academicYearId)
    .neq("kind", "course")
    .is("archived_at", null);
  if (recordsError) throw recordsError;
  const codeIdByVersion = new Map<number, number>();
  for (const record of records ?? []) {
    for (const versionId of [
      record.published_version_id,
      record.latest_source_version_id,
    ])
      if (versionId !== null) codeIdByVersion.set(versionId, record.code_id);
  }
  if (codeIdByVersion.size === 0) return [];

  const { data: conditions, error: conditionsError } = await supabase
    .from("requirement_conditions")
    .select("tag,version_id")
    .eq("condition_kind", "tagged_units")
    .not("tag", "is", null)
    .in("version_id", [...codeIdByVersion.keys()]);
  if (conditionsError) throw conditionsError;
  const tagged = (conditions ?? []).flatMap((row) => {
    const tag = row.tag?.trim();
    return tag ? [{ tag, versionId: row.version_id }] : [];
  });
  if (tagged.length === 0) return [];

  const [courseTags, codes] = await Promise.all([
    supabase
      .from("course_tags")
      .select("name")
      .in("name", [...new Set(tagged.map((row) => row.tag))]),
    supabase
      .from("catalogue_codes")
      .select("id,code")
      .in("id", [...new Set(codeIdByVersion.values())]),
  ]);
  if (courseTags.error) throw courseTags.error;
  if (codes.error) throw codes.error;
  const supplied = new Set(
    [...listNames, ...(courseTags.data ?? []).map((row) => row.name)].map(
      (name) => name.toLowerCase(),
    ),
  );
  const codeById = new Map((codes.data ?? []).map((row) => [row.id, row.code]));

  const structuresByTag = new Map<string, Set<string>>();
  for (const { tag, versionId } of tagged) {
    if (supplied.has(tag.toLowerCase())) continue;
    const structures = structuresByTag.get(tag) ?? new Set<string>();
    const codeId = codeIdByVersion.get(versionId);
    const code = codeId === undefined ? undefined : codeById.get(codeId);
    if (code) structures.add(code);
    structuresByTag.set(tag, structures);
  }
  return [...structuresByTag]
    .map(([name, structures]) => ({
      name,
      structureCodes: [...structures].sort(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
