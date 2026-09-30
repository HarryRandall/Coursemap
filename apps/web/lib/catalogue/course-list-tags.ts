import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TaggedCourse = { code: string; year: number; tags?: string[] };

/**
 * Adds each published course list a course belongs to in its year as a tag,
 * so tag rules count list members without a new course version. Tags already
 * on the course keep their spelling.
 */
export async function withCourseListTags<Course extends TaggedCourse>(
  supabase: SupabaseClient<Database>,
  courses: readonly Course[],
): Promise<Course[]> {
  if (courses.length === 0) return [...courses];
  const { data, error } = await supabase.rpc("published_course_list_tags", {
    p_years: [...new Set(courses.map((course) => course.year))],
    p_codes: [...new Set(courses.map((course) => course.code.toUpperCase()))],
  });
  if (error) throw error;

  const listTags = new Map<string, string[]>();
  for (const row of data ?? []) {
    const key = `${row.academic_year}:${row.course_code}`;
    listTags.set(key, [...(listTags.get(key) ?? []), row.tag]);
  }
  return courses.map((course) => {
    const extra = listTags.get(`${course.year}:${course.code.toUpperCase()}`);
    if (!extra) return course;
    const tags = [...(course.tags ?? [])];
    const seen = new Set(tags.map((tag) => tag.toLowerCase()));
    for (const tag of extra) {
      if (seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
    return { ...course, tags };
  });
}
