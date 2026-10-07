"use server";

import { revalidatePath } from "next/cache";
import {
  type AuthViewer,
  canWriteCatalogueRecord,
  getAuthViewer,
} from "@/lib/auth/viewer";
import type { CatalogueContent } from "@/lib/catalogue/content";
import {
  beginCatalogueDraft,
  CatalogueDraftConflictError,
  CatalogueDraftError,
  type CatalogueRecordIdentity,
  discardCatalogueDraft,
  loadCatalogueRecordIdentity,
  publishCatalogueDraft,
  restoreCatalogueVersion,
  resolveDraftExtractionError,
  saveCatalogueDraft,
  unpublishCatalogueRecord,
} from "@/lib/catalogue/drafts";
import {
  markFieldForReview,
  resolveSourceChange,
} from "@/lib/catalogue/source-review-decisions";
import { adminCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { revalidatePublishedRecord } from "@/lib/coursemap/published-cache";
import type { SourceReviewDecision } from "@/lib/catalogue/source-review-store";

export type DraftActionResult =
  | { ok: true; message?: string; revision?: number; unchanged?: boolean }
  | {
      ok: false;
      error: string;
      code?: string;
      currentRevision?: number;
    };

/**
 * Courses need courses.write and academic structures catalogue.write, so the
 * permission follows the record the server finds for the id, never anything
 * the browser says about it.
 */
async function requireCatalogueWrite(
  recordId: number,
): Promise<
  | { ok: true; viewer: AuthViewer; record: CatalogueRecordIdentity }
  | { ok: false; result: DraftActionResult }
> {
  const viewer = await getAuthViewer();
  if (!viewer)
    return {
      ok: false,
      result: { ok: false, error: "Authentication is required." },
    };
  const record = Number.isSafeInteger(recordId)
    ? await loadCatalogueRecordIdentity(recordId)
    : null;
  if (!record)
    return {
      ok: false,
      result: {
        ok: false,
        error: "The catalogue record does not exist.",
        code: "NOT_FOUND",
      },
    };
  if (!(await canWriteCatalogueRecord(record.kind)))
    return {
      ok: false,
      result: {
        ok: false,
        error:
          record.kind === "course"
            ? "Course write permission is required."
            : "Catalogue write permission is required.",
      },
    };
  return { ok: true, viewer, record };
}

/**
 * Refreshes the admin record page. The path comes from the record the server
 * found, never from the browser, and carries no query string, because
 * revalidatePath matches a route path rather than a URL.
 */
function revalidateRecord(record: CatalogueRecordIdentity) {
  revalidatePath(
    adminCatalogueRecordPath(record.kind, record.academicYear, record.code),
  );
}

/** Drops the admin record page and the public reads for one publication change. */
function revalidatePublication(record: CatalogueRecordIdentity) {
  revalidateRecord(record);
  revalidatePublishedRecord(record);
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
}: {
  recordId: number;
  expectedRevision: number;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const published = await publishCatalogueDraft({
      recordId,
      expectedRevision,
      editingSessionId,
      userId: viewer.id,
    });
    revalidatePublication(published.record);
    return { ok: true, message: "Published. Students now see this version." };
  } catch (error) {
    return draftFailure(error, "The draft could not be published.");
  }
}

export async function unpublishAction({
  recordId,
  editingSessionId,
}: {
  recordId: number;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const unpublished = await unpublishCatalogueRecord({
      recordId,
      editingSessionId,
      userId: viewer.id,
    });
    revalidatePublication(unpublished.record);
    return {
      ok: true,
      message: "Unpublished. Students no longer see this record for the year.",
    };
  } catch (error) {
    return draftFailure(error, "The record could not be unpublished.");
  }
}

/**
 * Opening the editor is what makes a record a draft, so that is an act the
 * server hears about rather than a state the browser holds on its own.
 */
export async function beginCatalogueDraftAction({
  recordId,
  editingSessionId,
}: {
  recordId: number;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const { draft } = await beginCatalogueDraft({
      recordId,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
    return { ok: true, revision: draft.revision };
  } catch (error) {
    return draftFailure(error, "The draft could not be opened.");
  }
}

export async function saveCatalogueDraftAction({
  recordId,
  expectedRevision,
  content,
  editingSessionId,
}: {
  recordId: number;
  expectedRevision: number;
  content: CatalogueContent;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const result = await saveCatalogueDraft({
      recordId,
      expectedRevision,
      content,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
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

export async function resolveDraftExtractionErrorAction({
  recordId,
  expectedRevision,
  flagIndex,
  reviewReason,
  editingSessionId,
}: {
  recordId: number;
  expectedRevision: number;
  flagIndex: number;
  reviewReason?: string;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const result = await resolveDraftExtractionError({
      recordId,
      expectedRevision,
      flagIndex,
      reviewReason,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
    return {
      ok: true,
      revision: result.revision,
      message:
        "Extraction error marked reviewed. Check the remaining errors before publishing.",
    };
  } catch (error) {
    return draftFailure(error, "The extraction error could not be reviewed.");
  }
}

export async function discardDraftAction({
  recordId,
  expectedRevision,
  editingSessionId,
}: {
  recordId: number;
  expectedRevision: number;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const result = await discardCatalogueDraft({
      recordId,
      expectedRevision,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
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
}: {
  recordId: number;
  versionId: number;
  expectedRevision: number | null;
  replaceExistingDraft: boolean;
  editingSessionId: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const result = await restoreCatalogueVersion({
      recordId,
      versionId,
      expectedRevision,
      replaceExistingDraft,
      editingSessionId,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
    return {
      ok: true,
      revision: result.revision,
      message: result.replacedVersionId
        ? "Version restored as a draft. Your previous draft is in the Changelog."
        : "Version restored as a draft.",
    };
  } catch (error) {
    return draftFailure(error, "The version could not be restored.");
  }
}

export async function resolveSourceChangeAction({
  recordId,
  changeId,
  decision,
}: {
  recordId: number;
  changeId: number;
  decision: SourceReviewDecision;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  try {
    const resolved = await resolveSourceChange({
      recordId,
      changeId,
      decision,
      userId: viewer.id,
    });
    revalidateRecord(access.record);
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

/**
 * Approves parts of a record's first ANU reading as read. Each keeps the value
 * the draft already holds, so approving changes no content; it only clears
 * the item, and with it any hold on publishing.
 */
export async function approveFirstReadAction({
  recordId,
  changeIds,
}: {
  recordId: number;
  changeIds: number[];
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  const { viewer } = access;
  let revision: number | undefined;
  try {
    for (const changeId of changeIds) {
      const resolved = await resolveSourceChange({
        recordId,
        changeId,
        decision: "use_source",
        userId: viewer.id,
      });
      revision = resolved.revision;
    }
  } catch (error) {
    revalidateRecord(access.record);
    return draftFailure(error, "The ANU reading could not be approved.");
  }
  revalidateRecord(access.record);
  return {
    ok: true,
    revision,
    message:
      changeIds.length === 1
        ? "Approved."
        : `${changeIds.length} parts approved.`,
  };
}

/** Puts one field back on the Changes tab for a person to look at. */
export async function markFieldForReviewAction({
  recordId,
  fieldPath,
}: {
  recordId: number;
  fieldPath: string;
}): Promise<DraftActionResult> {
  const access = await requireCatalogueWrite(recordId);
  if (!access.ok) return access.result;
  try {
    const marked = await markFieldForReview({
      recordId,
      fieldPath,
      userId: access.viewer.id,
    });
    revalidateRecord(access.record);
    return { ok: true, message: `${marked.label} is back up for review.` };
  } catch (error) {
    return draftFailure(error, "The field could not be marked for review.");
  }
}
