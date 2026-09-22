"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Check,
  EyeOff,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { useCatalogueEditor } from "./catalogue-editor-context";

/**
 * What state this record's content is in, and what can be done about it.
 *
 * It sits above the record's title rather than above the fields, because what
 * it reports - read-only, unsaved, published - is true of the whole record and
 * not of one tab. The actions follow the state, so nothing is offered that
 * would fail if it were chosen: a record with no draft offers only Edit, and
 * discarding and publishing appear once there is a draft to act on.
 */
export function CatalogueEditorToolbar() {
  const {
    beginEditing,
    cancelEditing,
    dirty,
    discard,
    editing,
    hasDraft,
    hasUnpublishedChanges,
    isPublished,
    publish,
    saveError,
    saveState,
    unpublish,
  } = useCatalogueEditor();
  const busy = dirty || saveState === "saving";
  // What the record is right now, said plainly. The header badge beside the
  // code is the same fact in shorthand; this is the line that also explains
  // what it means for students, because this is where it can be changed.
  const resting = hasDraft
    ? {
        dot: "bg-violet-500",
        label: "Draft",
        detail: isPublished
          ? "Unpublished edits sit on top of the published version."
          : "Unpublished edits, not visible to students.",
      }
    : isPublished
      ? {
          dot: "bg-emerald-500",
          label: "Published",
          detail: "Students see this version.",
        }
      : {
          dot: "bg-muted-foreground/40",
          label: "Not published",
          detail: "Students cannot see this record yet.",
        };

  return (
    <div className="sticky top-[6.5rem] z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur">
      <div
        className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        role={
          saveState === "error" || saveState === "conflict" ? "alert" : "status"
        }
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${resting.dot}`}
        />
        <span className="font-medium text-foreground">{resting.label}</span>
        {editing ? (
          <>
            <span aria-hidden="true" className="text-muted-foreground/50">
              &middot;
            </span>
            {saveState === "saving" ? (
              <LoaderCircle
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : saveState === "error" || saveState === "conflict" ? (
              <TriangleAlert
                className="size-4 text-destructive"
                aria-hidden="true"
              />
            ) : (
              <Check
                className="size-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            )}
            <span
              className={
                saveState === "error" || saveState === "conflict"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {saveState === "saving"
                ? "Saving..."
                : saveState === "conflict"
                  ? "This draft changed elsewhere"
                  : saveState === "error"
                    ? `Unable to save${saveError ? `: ${saveError}` : ""}`
                    : "Saved"}
            </span>
            {saveState === "conflict" ? (
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                <RefreshCw aria-hidden="true" /> Reload
              </Button>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">{resting.detail}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isPublished ? (
          <ConfirmDialog
            title="Unpublish this record?"
            description="Students will no longer see this record for this year. Versions and draft work will be retained."
            confirmLabel="Unpublish"
            destructive
            onConfirm={unpublish}
            trigger={
              <Button variant="outline" size="sm" type="button">
                <EyeOff aria-hidden="true" /> Unpublish
              </Button>
            }
          />
        ) : null}
        {!editing ? (
          <Button size="sm" type="button" onClick={beginEditing}>
            <Pencil aria-hidden="true" /> Edit
          </Button>
        ) : null}
        {/*
          Nothing has been saved yet, so leaving edit mode is just that. Once a
          draft exists, discarding it is the way back and this is gone.
        */}
        {editing && !hasDraft ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            onClick={cancelEditing}
          >
            Cancel
          </Button>
        ) : null}
        {hasDraft ? (
          <>
            <ConfirmDialog
              title="Discard this draft?"
              description={
                isPublished
                  ? "The editor goes back to the published version. A restorable checkpoint of the draft will be kept in the changelog."
                  : "The editor goes back to an unpublished, empty record. A restorable checkpoint of the draft will be kept in the changelog."
              }
              confirmLabel="Discard draft"
              destructive
              onConfirm={discard}
              trigger={
                <Button variant="ghost" size="sm" type="button" disabled={busy}>
                  <Trash2 aria-hidden="true" /> Discard draft
                </Button>
              }
            />
            <ConfirmDialog
              title="Publish these changes?"
              description="The saved draft will become the student-visible version. The currently published version stays live until publication succeeds."
              confirmLabel="Publish"
              onConfirm={publish}
              trigger={
                <Button
                  size="sm"
                  type="button"
                  disabled={
                    !hasUnpublishedChanges || busy || saveState === "conflict"
                  }
                >
                  <Send aria-hidden="true" /> Publish
                </Button>
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
