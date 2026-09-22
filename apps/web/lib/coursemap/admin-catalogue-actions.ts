"use server";

import { revalidatePath } from "next/cache";
import { canWriteCatalogue, getAuthViewer } from "@/lib/auth/viewer";
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
import { resolveSourceChange } from "@/lib/catalogue/source-review-decisions";
import type { SourceReviewDecision } from "@/lib/catalogue/source-review-store";

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

/**
 * The record page identifies itself with a URL carrying the academic year, but
 * revalidatePath matches a route path. Passing the query string made every
 * revalidation silently miss, so an accepted change only appeared after a
 * manual reload.
 */
function revalidateRecord(path: string) {
  revalidatePath(path.split("?")[0] ?? path);
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

export async function resolveSourceChangeAction({
  recordId,
  changeId,
  decision,
  path,
}: {
  recordId: number;
  changeId: number;
  decision: SourceReviewDecision;
  path: string;
}): Promise<DraftActionResult> {
  if (!(await canWriteCatalogue()))
    return { ok: false, error: "Catalogue write permission is required." };
  const viewer = await getAuthViewer();
  if (!viewer) return { ok: false, error: "Authentication is required." };
  try {
    const resolved = await resolveSourceChange({
      recordId,
      changeId,
      decision,
      userId: viewer.id,
    });
    revalidateRecord(path);
    return {
      ok: true,
      revision: resolved.revision,
      message:
        decision === "use_source"
          ? `${resolved.label} now matches ANU.`
          : `${resolved.label} keeps its current value.`,
    };
  } catch (error) {
    return draftFailure(error, "The ANU change could not be resolved.");
  }
}
