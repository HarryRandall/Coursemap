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
import type { CatalogueContent } from "@/lib/catalogue/content";
import {
  CatalogueDraftConflictError,
  CatalogueDraftError,
  discardCatalogueDraft,
  publishCatalogueDraft,
  restoreCatalogueVersion,
  saveCatalogueDraft,
  unpublishCatalogueRecord,
} from "@/lib/catalogue/drafts";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string };

export type DraftActionResult =
  | { ok: true; message?: string; revision?: number; unchanged?: boolean }
  | {
      ok: false;
      error: string;
      code?: string;
      currentRevision?: number;
    };

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

function draftFailure(error: unknown, fallback: string): DraftActionResult {
  if (error instanceof CatalogueDraftConflictError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      currentRevision: error.currentRevision,
    };
  }
  if (error instanceof CatalogueDraftError)
    return { ok: false, error: error.message, code: error.code };
  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function publishDraftAction({
  recordId,
  expectedRevision,
  editingSessionId,
  path,
}: {
  recordId: number;
  expectedRevision: number;
  editingSessionId: string;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    await publishCatalogueDraft({
      recordId,
      expectedRevision,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return { ok: true, message: "Published. Students now see this version." };
  } catch (error) {
    return draftFailure(error, "The draft could not be published.");
  }
}

export async function unpublishAction({
  recordId,
  editingSessionId,
  path,
}: {
  recordId: number;
  editingSessionId: string;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    await unpublishCatalogueRecord({
      recordId,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return {
      ok: true,
      message: "Unpublished. Students no longer see this record for the year.",
    };
  } catch (error) {
    return draftFailure(error, "The record could not be unpublished.");
  }
}

export async function saveCatalogueDraftAction({
  recordId,
  expectedRevision,
  content,
  editingSessionId,
  path,
}: {
  recordId: number;
  expectedRevision: number;
  content: CatalogueContent;
  editingSessionId: string;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await saveCatalogueDraft({
      recordId,
      expectedRevision,
      content,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return {
      ok: true,
      revision: result.draft.revision,
      unchanged: result.unchanged,
      message: result.unchanged ? "Saved." : "Draft saved.",
    };
  } catch (error) {
    return draftFailure(error, "The draft could not be saved.");
  }
}

export async function discardDraftAction({
  recordId,
  expectedRevision,
  editingSessionId,
  path,
}: {
  recordId: number;
  expectedRevision: number;
  editingSessionId: string;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await discardCatalogueDraft({
      recordId,
      expectedRevision,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return {
      ok: true,
      message: result.meaningful
        ? "Draft discarded. A restorable checkpoint was kept."
        : "Draft discarded.",
    };
  } catch (error) {
    return draftFailure(error, "The draft could not be discarded.");
  }
}

export async function restoreCatalogueVersionAction({
  recordId,
  versionId,
  expectedRevision,
  replaceExistingDraft,
  editingSessionId,
  path,
}: {
  recordId: number;
  versionId: number;
  expectedRevision: number | null;
  replaceExistingDraft: boolean;
  editingSessionId: string;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const result = await restoreCatalogueVersion({
      recordId,
      versionId,
      expectedRevision,
      replaceExistingDraft,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return {
      ok: true,
      revision: result.revision,
      message: "Version restored as a draft.",
    };
  } catch (error) {
    return draftFailure(error, "The version could not be restored.");
  }
}
