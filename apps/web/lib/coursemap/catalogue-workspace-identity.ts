import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Resolve an annual workspace UUID without guessing a catalogue year. */
export async function catalogueWorkspaceIdentity(
  kind: string,
  publicId: string,
) {
  const client = await createClient();
  if (kind === "course") {
    const { data, error } = await client
      .from("course_years")
      .select("courses!inner(public_id),academic_years!inner(year)")
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? { identityId: data.courses.public_id, year: data.academic_years.year }
      : null;
  }
  const { data, error } = await client
    .from("academic_structure_years")
    .select(
      "academic_structures!inner(public_id,kind),academic_years!inner(year)",
    )
    .eq("public_id", publicId)
    .eq("academic_structures.kind", kind)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        identityId: data.academic_structures.public_id,
        year: data.academic_years.year,
      }
    : null;
}
