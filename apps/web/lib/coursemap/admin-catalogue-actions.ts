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

/**
 * The record page identifies itself with a URL carrying the academic year, but
 * revalidatePath matches a route path. Passing the query string made every
 * revalidation silently miss, so an accepted change only appeared after a
 * manual reload.
 */
function revalidateRecord(path: string) {
  revalidatePath(path.split("?")[0] ?? path);
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
  revalidateRecord(path);
  return { ok: true };
}

/**
 * Several review entries at once: one group of changes, one kind of flag, or
 * everything still open. The reviewer already has the entries on screen, so
 * the ids come with the request rather than being looked up again, which keeps
 * a bulk decision to exactly the rows the reviewer was shown.
 */
export async function resolveReviewEntriesAction({
  entryIds,
  status,
  note,
  path,
}: {
  entryIds: number[];
  status: "open" | "accepted" | "rejected" | "acknowledged";
  note?: string;
  path: string;
}): Promise<ActionResult> {
  if (!(await canManageCourseImports()))
    return { ok: false, error: "Import permission is required." };
  if (entryIds.length === 0)
    return { ok: false, error: "There was nothing to decide." };
  const supabase = await createClient();
  let resolved = 0;
  for (const entryId of entryIds) {
    const { error } = await supabase.rpc("resolve_catalogue_import_change", {
      p_change_id: entryId,
      p_status: status,
      p_note: note ?? undefined,
    });
    // Report what did land, so a partial failure is not read as none at all.
    if (error)
      return {
        ok: false,
        error:
          resolved === 0
            ? error.message
            : `${resolved} of ${entryIds.length} were saved, then: ${error.message}`,
      };
    resolved += 1;
  }
  revalidateRecord(path);
  const verb =
    status === "acknowledged"
      ? "acknowledged"
      : status === "open"
        ? "reopened"
        : status;
  return {
    ok: true,
    message: `${resolved} ${resolved === 1 ? "entry" : "entries"} ${verb}.`,
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
    revalidateRecord(path);
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
  revalidateRecord(path);
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
  revalidateRecord(path);
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
    revalidateRecord(path);
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
    revalidateRecord(path);
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
  revalidateRecord(path);
  return {
    ok: true,
    message: "Draft discarded. The snapshot stays in history.",
  };
}
