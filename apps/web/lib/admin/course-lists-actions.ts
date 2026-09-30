"use server";

import { revalidatePath } from "next/cache";
import { loadAdminCourseListsYear } from "@/lib/admin/course-lists";
import { canWriteCatalogue } from "@/lib/auth/viewer";
import {
  courseCodesInText,
  courseListSourceUrl,
  fetchCourseListCodes,
} from "@/lib/catalogue-import/course-list-source";
import { createClient } from "@/lib/supabase/server";

export type CourseListActionResult = {
  ok: boolean;
  message: string;
  listId?: number;
  codes?: string[];
};

const PERMISSION_REQUIRED = "Catalogue editing permission is required.";

function refreshCourseLists(year: number) {
  revalidatePath(`/admin/course-lists/${year}`);
  revalidatePath("/plan");
  revalidatePath("/requirements");
  revalidatePath("/dashboard");
}

/**
 * Saves a list's name, source link and draft membership. The codes are read
 * from whatever was pasted, so a copied page works as well as a code column.
 */
export async function saveCourseListAction(
  year: number,
  draft: { id?: number; name: string; sourceUrl: string; codesText: string },
): Promise<CourseListActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, message: PERMISSION_REQUIRED };
  const name = draft.name.trim();
  if (!name) return { ok: false, message: "Give the list a name." };
  const sourceUrl = draft.sourceUrl.trim();
  if (sourceUrl && !courseListSourceUrl(sourceUrl))
    return {
      ok: false,
      message: "The source link must be a public HTTPS page.",
    };
  const codes = courseCodesInText(draft.codesText);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_course_list", {
    p_academic_year: year,
    p_name: name,
    p_codes: codes,
    p_source_url: sourceUrl || undefined,
    p_list_id: draft.id,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505"
          ? `A list named ${name} already exists in ${year}.`
          : "The course list could not be saved.",
    };
  refreshCourseLists(year);
  return {
    ok: true,
    message: `${name} saved with ${codes.length} ${codes.length === 1 ? "course" : "courses"}.`,
    listId: data,
    codes,
  };
}

/** Reads the codes on the source page for review; nothing is saved. */
export async function fetchCourseListCodesAction(
  sourceUrl: string,
): Promise<CourseListActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, message: PERMISSION_REQUIRED };
  try {
    const codes = await fetchCourseListCodes(sourceUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    return codes.length
      ? {
          ok: true,
          message: `Found ${codes.length} ${codes.length === 1 ? "course" : "courses"}.`,
          codes,
        }
      : { ok: false, message: "No course codes were found on that page." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof TypeError
          ? error.message
          : "The source page could not be fetched. Check the link and try again.",
    };
  }
}

export async function publishCourseListAction(
  year: number,
  listId: number,
): Promise<CourseListActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, message: PERMISSION_REQUIRED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_course_list", {
    p_list_id: listId,
  });
  if (error)
    return { ok: false, message: "The course list could not be published." };
  refreshCourseLists(year);
  return { ok: true, message: "Course list published." };
}

export async function deleteCourseListAction(
  year: number,
  listId: number,
): Promise<CourseListActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, message: PERMISSION_REQUIRED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_course_list", {
    p_list_id: listId,
  });
  if (error)
    return { ok: false, message: "The course list could not be deleted." };
  refreshCourseLists(year);
  return { ok: true, message: "Course list deleted." };
}

/**
 * Copies the latest earlier year's lists that this year lacks, as drafts with
 * the same names, links and codes. Nothing is published.
 */
export async function copyPreviousCourseListsAction(
  year: number,
): Promise<CourseListActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, message: PERMISSION_REQUIRED };
  let data;
  try {
    data = await loadAdminCourseListsYear(year);
  } catch {
    return { ok: false, message: "The earlier lists could not be loaded." };
  }
  if (!data.previous)
    return { ok: false, message: "No earlier year has course lists." };
  const existing = new Set(data.lists.map((list) => list.name.toLowerCase()));
  const templates = data.previous.lists.filter(
    (list) => !existing.has(list.name.toLowerCase()),
  );
  const supabase = await createClient();
  for (const template of templates) {
    const { error } = await supabase.rpc("save_course_list", {
      p_academic_year: year,
      p_name: template.name,
      p_codes: template.codes,
      p_source_url: template.sourceUrl ?? undefined,
    });
    if (error) {
      refreshCourseLists(year);
      return { ok: false, message: `${template.name} could not be copied.` };
    }
  }
  refreshCourseLists(year);
  return {
    ok: true,
    message: `Copied ${templates.length} ${templates.length === 1 ? "list" : "lists"} from ${data.previous.year} as drafts. Check each source for ${year} before publishing.`,
  };
}
