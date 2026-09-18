"use server";

import { revalidatePath } from "next/cache";
import {
  canManageCourseImports,
  canWriteCatalogue,
  getAuthViewer,
} from "@/lib/auth/viewer";
import {
  ApplyReviewError,
  applyImportReview,
} from "@/lib/catalogue-import/apply-review";
import {
  ManualSnapshotError,
  restoreSnapshot,
  saveManualSnapshot,
} from "@/lib/catalogue-import/manual-snapshot";
import type { CatalogueSnapshotWrite } from "@/lib/catalogue-import/snapshot-write";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string };

function failure(error: unknown, fallback: string): ActionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function resolveReviewEntryAction({
  entryId,
  status,
  note,
  path,
}: {
  entryId: number;
  status: "open" | "accepted" | "rejected" | "acknowledged";
  note?: string;
  path: string;
}): Promise<ActionResult> {
  if (!(await canManageCourseImports()))
    return { ok: false, error: "Import permission is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_catalogue_import_change", {
    p_change_id: entryId,
    p_status: status,
    p_note: note ?? undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(path);
  return { ok: true };
}

export async function resolveAllChangesAction({
  targetId,
  status,
  path,
}: {
  targetId: string;
  status: "accepted" | "rejected";
  path: string;
}): Promise<ActionResult> {
  if (!(await canManageCourseImports()))
    return { ok: false, error: "Import permission is required." };
  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("catalogue_import_changes")
    .select("id")
    .eq("target_id", targetId)
    .eq("entry_kind", "change")
    .eq("status", "open");
  if (error) return { ok: false, error: error.message };
  for (const entry of entries ?? []) {
    const { error: resolveError } = await supabase.rpc(
      "resolve_catalogue_import_change",
      {
        p_change_id: entry.id,
        p_status: status,
      },
    );
    if (resolveError) return { ok: false, error: resolveError.message };
  }
  revalidatePath(path);
  return {
    ok: true,
    message: `${entries?.length ?? 0} change${entries?.length === 1 ? "" : "s"} ${status}.`,
  };
}

export async function applyReviewAction({
  targetId,
  path,
}: {
  targetId: string;
  path: string;
}): Promise<ActionResult> {
  if (!(await canManageCourseImports()))
    return { ok: false, error: "Import permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await applyImportReview({ targetId, userId: viewer.id });
    revalidatePath(path);
    return {
      ok: true,
      message: result.reusedCandidate
        ? "The import is now the draft."
        : "A new draft combines the current content with the accepted changes.",
    };
  } catch (error) {
    if (error instanceof ApplyReviewError)
      return { ok: false, error: error.message };
    return failure(error, "The review could not be applied.");
  }
}

export async function publishDraftAction({
  itemYearId,
  path,
}: {
  itemYearId: number;
  path: string;
}): Promise<ActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_catalogue_snapshot", {
    p_item_year_id: itemYearId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(path);
  return { ok: true, message: "Published. Students now see this version." };
}

export async function unpublishAction({
  itemYearId,
  path,
}: {
  itemYearId: number;
  path: string;
}): Promise<ActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpublish_catalogue_item_year", {
    p_item_year_id: itemYearId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(path);
  return {
    ok: true,
    message: "Unpublished. Students no longer see this record for the year.",
  };
}

export async function saveManualSnapshotAction({
  itemYearId,
  baseSnapshotId,
  write,
  path,
}: {
  itemYearId: number;
  baseSnapshotId: number | null;
  write: CatalogueSnapshotWrite;
  path: string;
}): Promise<ActionResult & { snapshotId?: number }> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await saveManualSnapshot({
      itemYearId,
      baseSnapshotId,
      write,
      userId: viewer.id,
    });
    revalidatePath(path);
    return {
      ok: true,
      snapshotId: result.snapshotId,
      message: result.unchanged
        ? "Nothing changed."
        : "Saved as the new draft.",
    };
  } catch (error) {
    if (error instanceof ManualSnapshotError)
      return { ok: false, error: error.message };
    return failure(error, "The draft could not be saved.");
  }
}

export async function restoreSnapshotAction({
  itemYearId,
  snapshotId,
  path,
}: {
  itemYearId: number;
  snapshotId: number;
  path: string;
}): Promise<ActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await restoreSnapshot({
      itemYearId,
      snapshotId,
      userId: viewer.id,
    });
    revalidatePath(path);
    return {
      ok: true,
      message: result.unchanged
        ? "That snapshot already matches the draft."
        : `Snapshot #${snapshotId} is now the draft.`,
    };
  } catch (error) {
    if (error instanceof ManualSnapshotError)
      return { ok: false, error: error.message };
    return failure(error, "The snapshot could not be restored.");
  }
}

export async function discardDraftAction({
  itemYearId,
  path,
}: {
  itemYearId: number;
  path: string;
}): Promise<ActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_catalogue_draft", {
    p_item_year_id: itemYearId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(path);
  return {
    ok: true,
    message: "Draft discarded. The snapshot stays in history.",
  };
}
