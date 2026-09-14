import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CourseWorkspaceImport = {
  id: string;
  created_at: string;
  processing_status: string;
  review_status: string;
  candidate_snapshot_id: number | null;
  error_summary: string | null;
};

export type CourseWorkspaceEntry = {
  publicId: string | null;
  code: string;
  title: string;
  year: number;
  importEnabled: boolean;
  imports: CourseWorkspaceImport[];
};

export async function loadCourseWorkspaceEntry(
  identifier: string,
  year: number,
  includeImports: boolean,
): Promise<CourseWorkspaceEntry | null> {
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2200) return null;
  const supabase = await createClient();
  const isCode = /^[A-Z]{4}\d{4}[A-Z]?$/u.test(identifier.toUpperCase());
  if (!isCode && !/^[0-9a-f-]{36}$/iu.test(identifier)) return null;
  const course = await supabase
    .from("courses")
    .select("code,public_id")
    .eq(
      isCode ? "code" : "public_id",
      isCode ? identifier.toUpperCase() : identifier,
    )
    .maybeSingle();
  if (course.error) throw course.error;
  if (!isCode && !course.data) return null;
  const code = course.data?.code ?? identifier.toUpperCase();
  const academicYear = await supabase
    .from("academic_years")
    .select("id,year,is_import_enabled,source_availability")
    .eq("year", year)
    .maybeSingle();
  if (academicYear.error) throw academicYear.error;
  if (!academicYear.data) return null;
  const entry = await supabase
    .from("course_directory_entries")
    .select("title")
    .eq("academic_year_id", academicYear.data.id)
    .eq("code", code)
    .maybeSingle();
  if (entry.error) throw entry.error;
  if (!entry.data) return null;
  const imports = includeImports
    ? await supabase
        .from("course_import_targets")
        .select(
          "id,created_at,processing_status,review_status,candidate_snapshot_id,error_summary",
        )
        .eq("academic_year_id", academicYear.data.id)
        .eq("course_code", code)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (imports.error) throw imports.error;
  return {
    publicId: course.data?.public_id ?? null,
    code,
    title: entry.data.title,
    year,
    importEnabled:
      academicYear.data.is_import_enabled &&
      academicYear.data.source_availability !== "unavailable",
    imports: imports.data ?? [],
  };
}
