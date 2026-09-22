"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

import type { CatalogueContent } from "@/lib/catalogue/content";
import {
  discardDraftAction,
  publishDraftAction,
  saveCatalogueDraftAction,
  unpublishAction,
} from "@/lib/coursemap/admin-catalogue-actions";

export type CatalogueSaveState = "saved" | "saving" | "error" | "conflict";

export type CatalogueEditor = {
  write: CatalogueContent;
  setWrite: Dispatch<SetStateAction<CatalogueContent>>;
  /** Whether the fields are being offered for change or merely read. */
  editing: boolean;
  beginEditing: () => void;
  cancelEditing: () => void;
  dirty: boolean;
  saveState: CatalogueSaveState;
  saveError: string | null;
  isPublished: boolean;
  hasDraft: boolean;
  hasUnpublishedChanges: boolean;
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
  discard: () => Promise<void>;
};

const CatalogueEditorContext = createContext<CatalogueEditor | null>(null);

export function useCatalogueEditor() {
  const editor = useContext(CatalogueEditorContext);
  if (!editor)
    throw new Error(
      "A catalogue editor surface must be rendered inside CatalogueEditorProvider.",
    );
  return editor;
}

/**
 * One record's editing session, shared by every surface that acts on it.
 *
 * The state lives here rather than beside the fields because the toolbar that
 * reports and commits it sits above the record's title, outside the tab the
 * fields are in. Both read the same session, so what the toolbar says is
 * always what the fields hold.
 *
 * Accepted changes autosave against an expected revision, so another tab can
 * never be overwritten silently.
 */
export function CatalogueEditorProvider({
  initial,
  recordId,
  initialRevision,
  initiallyPublished,
  initialHasDraft,
  initialHasUnpublishedChanges,
  path,
  children,
}: {
  initial: CatalogueContent;
  recordId: number;
  initialRevision: number;
  initiallyPublished: boolean;
  /** False until a change worth keeping has been saved against this record. */
  initialHasDraft: boolean;
  initialHasUnpublishedChanges: boolean;
  path: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [write, setWrite] = useState<CatalogueContent>(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [savedContent, setSavedContent] = useState(() =>
    JSON.stringify(initial),
  );
  const [saveState, setSaveState] = useState<CatalogueSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [failedContent, setFailedContent] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(initiallyPublished);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  // A record that already carries a draft is already being worked on, so it
  // opens ready to edit. Everything else opens as a reading of the record.
  const [editing, setEditing] = useState(initialHasDraft);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    initialHasUnpublishedChanges,
  );
  const [editingSessionId, setEditingSessionId] = useState(() =>
    crypto.randomUUID(),
  );
  const currentContent = JSON.stringify(write);
  const dirty = currentContent !== savedContent;
  // Publication is the only action here that changes a public page, so it is
  // also the only one that has to drop the cached public reads.
  const publishedRecord = {
    kind: initial.kind,
    academicYear: initial.academicYear,
    code: initial.code,
  };

  useEffect(() => {
    const inactivityTimeout = window.setTimeout(
      () => setEditingSessionId(crypto.randomUUID()),
      30 * 60 * 1000,
    );
    return () => window.clearTimeout(inactivityTimeout);
  }, [currentContent]);

  useEffect(() => {
    if (
      !dirty ||
      saveState === "saving" ||
      saveState === "conflict" ||
      failedContent === currentContent
    )
      return;
    const snapshot = write;
    const snapshotContent = currentContent;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      const result = await saveCatalogueDraftAction({
        recordId,
        expectedRevision: revision,
        content: snapshot,
        editingSessionId,
        path,
      });
      if (result.ok) {
        setRevision(result.revision ?? revision);
        setSavedContent(snapshotContent);
        setFailedContent(null);
        setSaveState("saved");
        if (!result.unchanged) {
          setHasDraft(true);
          setHasUnpublishedChanges(true);
        }
        return;
      }
      setSaveError(result.error);
      setFailedContent(snapshotContent);
      setSaveState(result.code === "STALE_DRAFT" ? "conflict" : "error");
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [
    currentContent,
    dirty,
    editingSessionId,
    failedContent,
    path,
    recordId,
    revision,
    saveState,
    write,
  ]);

  async function publish() {
    const result = await publishDraftAction({
      recordId,
      expectedRevision: revision,
      editingSessionId,
      path,
      record: publishedRecord,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setIsPublished(true);
    setHasDraft(false);
    setHasUnpublishedChanges(false);
    setEditing(false);
    router.refresh();
  }

  async function unpublish() {
    const result = await unpublishAction({
      recordId,
      editingSessionId,
      path,
      record: publishedRecord,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setIsPublished(false);
    router.refresh();
  }

  async function discard() {
    const result = await discardDraftAction({
      recordId,
      expectedRevision: revision,
      editingSessionId,
      path,
    });
    if (!result.ok) throw new Error(result.error);
    toast.success(result.message);
    setEditingSessionId(crypto.randomUUID());
    setHasDraft(false);
    setHasUnpublishedChanges(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <CatalogueEditorContext.Provider
      value={{
        write,
        setWrite,
        editing,
        beginEditing: () => setEditing(true),
        // Leaving edit mode is only offered while nothing has been saved, so
        // restoring what the record opened with can lose no stored work.
        cancelEditing: () => {
          setWrite(initial);
          setSavedContent(JSON.stringify(initial));
          setSaveState("saved");
          setSaveError(null);
          setEditing(false);
        },
        dirty,
        saveState,
        saveError,
        isPublished,
        hasDraft,
        hasUnpublishedChanges,
        publish,
        unpublish,
        discard,
      }}
    >
      {children}
    </CatalogueEditorContext.Provider>
  );
}
