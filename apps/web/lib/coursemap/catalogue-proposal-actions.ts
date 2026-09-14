"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { compareCatalogueProposal } from "./catalogue-proposal-comparison";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";

const comparisonSchema = z.object({
  currentSnapshotId: z.number(),
  before: z.unknown(),
  after: z.unknown(),
  issues: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      sourceText: z.string().nullable(),
      values: z.unknown(),
    }),
  ),
});

export async function inspectCatalogueProposal(
  targetId: string,
  structureKind?: AcademicStructureKind,
) {
  const client = await createClient();
  const { data, error } = await client.rpc("catalogue_import_comparison", {
    p_kind: structureKind ?? "course",
    p_target_id: targetId,
  });
  if (error) throw new Error(error.message);
  const comparison = comparisonSchema.parse(data);
  return {
    first: false,
    currentSnapshotId: comparison.currentSnapshotId,
    fields: compareCatalogueProposal(comparison.before, comparison.after),
    issues: comparison.issues,
  };
}

export async function applyCatalogueProposal(
  targetId: string,
  currentSnapshotId: number,
  fields: string[],
  structureKind?: AcademicStructureKind,
) {
  const client = await createClient();
  const { error } = await client.rpc("apply_catalogue_import_changes", {
    p_kind: structureKind ?? "course",
    p_target_id: targetId,
    p_expected_snapshot_id: currentSnapshotId,
    p_fields: fields,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}
