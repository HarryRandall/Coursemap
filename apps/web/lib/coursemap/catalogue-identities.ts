import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Annual identities are keyed by code and year, including unimported entries. */
export async function catalogueIdentities(kind: string, codes: string[]) {
  const client = await createClient();
  if (!codes.length) return new Map<string, string>();
  if (kind === "course") {
    const { data, error } = await client
      .from("course_years")
      .select("public_id,courses!inner(code),academic_years!inner(year)")
      .in("courses.code", codes);
    if (error) throw error;
    return new Map(
      data.map((row) => [
        `${row.courses.code}:${row.academic_years.year}`,
        row.public_id,
      ]),
    );
  }
  const { data, error } = await client
    .from("academic_structure_years")
    .select(
      "public_id,academic_structures!inner(code,kind),academic_years!inner(year)",
    )
    .in("academic_structures.code", codes)
    .eq("academic_structures.kind", kind);
  if (error) throw error;
  return new Map(
    data.map((row) => [
      `${row.academic_structures.code}:${row.academic_years.year}`,
      row.public_id,
    ]),
  );
}
