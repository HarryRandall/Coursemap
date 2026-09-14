import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function catalogueVersion(
  kind: string,
  identifier: string | number,
) {
  const client = await createClient();
  const table =
    kind === "course" ? "course_snapshots" : "academic_structure_snapshots";
  const { data, error } = await client
    .from(table)
    .select("id, public_id")
    .eq(typeof identifier === "number" ? "id" : "public_id", identifier)
    .maybeSingle();
  if (error) throw error;
  return data;
}
