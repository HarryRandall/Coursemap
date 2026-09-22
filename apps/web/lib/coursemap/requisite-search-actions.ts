"use server";

import {
  canManageCatalogueOperations,
  canWriteCourses,
} from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type RequisiteCourseSearchResult = {
  code: string;
  subject: string | null;
  title: string | null;
  /** Academic years with a catalogue year record, newest first. */
  years: number[];
};

// The details tables join through a composite key, so PostgREST types them as
// arrays even though each version has at most one details row.
type ItemYearEmbed = {
  academic_years: { year: number } | null;
  published: {
    course_version_details: { title: string }[];
    structure_version_details: { name: string }[];
  } | null;
};

const ITEM_SEARCH_SELECT =
  "code,kind,catalogue_records(academic_years(year),published:catalogue_versions!catalogue_records_published_version_fkey(course_version_details(title),structure_version_details(name)))";

function yearsNewestFirst(itemYears: ItemYearEmbed[]) {
  return itemYears
    .map((itemYear) => itemYear.academic_years?.year)
    .filter((year): year is number => typeof year === "number")
    .sort((left, right) => right - left);
}

/**
 * Search course identities for requisite editing. Titles come from a
 * published snapshot, so identities that have never been published match on
 * code only.
 */
export async function searchRequisiteCourses(
  query: string,
): Promise<RequisiteCourseSearchResult[]> {
  const term = query.trim().toUpperCase();
  if (term.length < 2) return [];
  if (!(await canWriteCourses()) && !(await canManageCatalogueOperations())) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalogue_codes")
      .select(ITEM_SEARCH_SELECT)
      .eq("kind", "course")
      .ilike("code", `%${term}%`)
      .order("code")
      .limit(25);
    if (error) throw error;

    return (data ?? []).map((item) => ({
      code: item.code,
      subject: item.code.slice(0, 4),
      title:
        item.catalogue_records
          .map(
            (itemYear) =>
              itemYear.published?.course_version_details[0]?.title ?? null,
          )
          .find((value) => value !== null) ?? null,
      years: yearsNewestFirst(item.catalogue_records),
    }));
  } catch {
    return [];
  }
}

export type RequisiteProgrammeSearchResult = {
  code: string;
  kind: string | null;
  title: string | null;
  years: number[];
};

export async function searchRequisiteProgrammes(
  query: string,
): Promise<RequisiteProgrammeSearchResult[]> {
  const term = query.trim().toUpperCase();
  if (term.length < 2) return [];
  if (!(await canManageCatalogueOperations())) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalogue_codes")
      .select(ITEM_SEARCH_SELECT)
      .neq("kind", "course")
      .ilike("code", `%${term}%`)
      .order("code")
      .limit(25);
    if (error) throw error;

    return (data ?? []).map((item) => ({
      code: item.code,
      kind: item.kind,
      title:
        item.catalogue_records
          .map(
            (itemYear) =>
              itemYear.published?.structure_version_details[0]?.name ?? null,
          )
          .find((value) => value !== null) ?? null,
      years: yearsNewestFirst(item.catalogue_records),
    }));
  } catch {
    return [];
  }
}
