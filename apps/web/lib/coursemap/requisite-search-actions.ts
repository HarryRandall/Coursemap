"use server";

import {
  canManageCatalogueImports,
  canManageCourseImports,
  canWriteCourses,
} from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type RequisiteCourseSearchResult = {
  code: string;
  subject: string | null;
  title: string | null;
  /** Academic years with a native course-year record, newest first. */
  years: number[];
};

/**
 * Search course identities for requisite editing. Titles come from the newest
 * published snapshot, so identities that have never been published match on
 * code only.
 */
export async function searchRequisiteCourses(
  query: string,
): Promise<RequisiteCourseSearchResult[]> {
  const term = query.trim().toUpperCase();
  if (term.length < 2) return [];
  if (!(await canWriteCourses()) && !(await canManageCourseImports())) {
    return [];
  }

  try {
    const supabase = await createClient();
    const { data: courses, error: coursesError } = await supabase
      .from("courses")
      .select(
        "code,course_years(academic_years(year),published:course_snapshots!course_years_published_snapshot_same_year_fkey(title))",
      )
      .ilike("code", `%${term}%`)
      .order("code")
      .limit(25);
    if (coursesError) throw coursesError;

    return (courses ?? []).map((course) => {
      const years = course.course_years
        .map((courseYear) => courseYear.academic_years?.year)
        .filter((year): year is number => typeof year === "number")
        .sort((left, right) => right - left);
      const title =
        course.course_years
          .map((courseYear) => courseYear.published?.title ?? null)
          .find((value) => value !== null) ?? null;
      return {
        code: course.code,
        subject: course.code.slice(0, 4),
        title,
        years,
      };
    });
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
  if (!(await canManageCatalogueImports())) return [];

  try {
    const supabase = await createClient();
    const { data: structures, error } = await supabase
      .from("academic_structures")
      .select(
        "code,kind,academic_structure_years(academic_years(year),published:academic_structure_snapshots!academic_structure_years_published_snapshot_fkey(name))",
      )
      .ilike("code", `%${term}%`)
      .order("code")
      .limit(25);
    if (error) throw error;

    return (structures ?? []).map((structure) => {
      const years = structure.academic_structure_years
        .map((structureYear) => structureYear.academic_years?.year)
        .filter((year): year is number => typeof year === "number")
        .sort((left, right) => right - left);
      const title =
        structure.academic_structure_years
          .map((structureYear) => structureYear.published?.name ?? null)
          .find((value) => value !== null) ?? null;
      return { code: structure.code, kind: structure.kind, title, years };
    });
  } catch {
    return [];
  }
}
