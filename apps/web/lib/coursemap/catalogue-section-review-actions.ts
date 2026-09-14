"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { catalogueSectionReviewSchema } from "./catalogue-section-review";

export async function loadCatalogueSectionReview(
  kind: string,
  yearId: number,
  snapshotId: number,
) {
  const client = await createClient();
  const { data, error } = await client.rpc("catalogue_review_state", {
    p_kind: kind,
    p_year_id: yearId,
    p_snapshot_id: snapshotId,
  });
  if (error) throw new Error(error.message);
  return catalogueSectionReviewSchema.parse(data);
}

export async function reviewCatalogueSections(input: {
  kind: string;
  yearId: number;
  snapshotId: number;
  sections: string[];
  approved: boolean;
  bulk: boolean;
}) {
  const client = await createClient();
  const { data, error } = await client.rpc("review_catalogue_sections", {
    p_kind: input.kind,
    p_year_id: input.yearId,
    p_snapshot_id: input.snapshotId,
    p_sections: input.sections,
    p_approved: input.approved,
    p_bulk: input.bulk,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
  return catalogueSectionReviewSchema.parse(data);
}

export async function restoreCatalogueVersion(input: {
  kind: string;
  yearId: number;
  versionId: string;
  expectedSnapshotId: number;
}) {
  const client = await createClient();
  const { error } = await client.rpc("restore_catalogue_version", {
    p_kind: input.kind,
    p_year_id: input.yearId,
    p_version_id: input.versionId,
    p_expected_snapshot_id: input.expectedSnapshotId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

const reviewHistorySchema = z.array(
  z.object({
    id: z.string(),
    section: z.string(),
    approved: z.boolean(),
    method: z.string(),
    actor: z.string(),
    createdAt: z.string(),
    versionId: z.string().nullable(),
  }),
);

export async function loadCatalogueReviewHistory(kind: string, yearId: number) {
  const client = await createClient();
  const { data, error } = await client.rpc("catalogue_review_history", {
    p_kind: kind,
    p_year_id: yearId,
  });
  if (error) throw new Error(error.message);
  return reviewHistorySchema.parse(data);
}
