import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";

export async function loadStructureWorkspaceEntry(
  identifier: string,
  kind: AcademicStructureKind,
  year: number,
  includeImports: boolean,
) {
  const supabase = await createClient();
  const isUuid = /^[0-9a-f-]{36}$/iu.test(identifier);
  const [identity, academicYear] = await Promise.all([
    supabase
      .from("academic_structures")
      .select("id,code,public_id")
      .eq("kind", kind)
      .eq(
        isUuid ? "public_id" : "code",
        isUuid ? identifier : identifier.toUpperCase(),
      )
      .maybeSingle(),
    supabase
      .from("academic_years")
      .select("id,is_import_enabled,source_availability")
      .eq("year", year)
      .maybeSingle(),
  ]);
  if (identity.error) throw identity.error;
  if (academicYear.error) throw academicYear.error;
  if (!academicYear.data || (isUuid && !identity.data)) return null;
  const code = identity.data?.code ?? identifier.toUpperCase();
  const [directory, imports, structureYear] = await Promise.all([
    supabase
      .from("academic_structure_directory_entries")
      .select("title,is_available")
      .eq("academic_year_id", academicYear.data.id)
      .eq("structure_kind", kind)
      .eq("code", code)
      .maybeSingle(),
    includeImports
      ? supabase
          .from("academic_structure_import_targets")
          .select(
            "id,created_at,processing_status,review_status,candidate_snapshot_id,error_summary",
          )
          .eq("academic_year_id", academicYear.data.id)
          .eq("structure_kind", kind)
          .eq("structure_code", code)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null },
    identity.data
      ? supabase
          .from("academic_structure_years")
          .select("id")
          .eq("structure_id", identity.data.id)
          .eq("academic_year_id", academicYear.data.id)
          .maybeSingle()
      : { data: null, error: null },
  ]);
  if (directory.error) throw directory.error;
  if (imports.error) throw imports.error;
  if (structureYear.error) throw structureYear.error;
  if (!directory.data) return null;
  const versions = structureYear.data
    ? await supabase
        .from("academic_structure_snapshots")
        .select("id,public_id,created_at,origin")
        .eq("structure_year_id", structureYear.data.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (versions.error) throw versions.error;
  return {
    code,
    kind,
    year,
    title: directory.data.title,
    publicId: identity.data?.public_id ?? null,
    importEnabled:
      directory.data.is_available &&
      academicYear.data.is_import_enabled &&
      academicYear.data.source_availability !== "unavailable",
    imports: imports.data ?? [],
    versions: versions.data ?? [],
  };
}

export type StructureWorkspaceEntry = NonNullable<
  Awaited<ReturnType<typeof loadStructureWorkspaceEntry>>
>;
