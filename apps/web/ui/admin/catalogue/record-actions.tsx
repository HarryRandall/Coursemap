"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import {
  Check,
  CircleStop,
  Ellipsis,
  EyeOff,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { useCatalogueEditor } from "./catalogue-editor-context";
import { type CatalogueSyncTarget, useCatalogueSync } from "./sync-button";

type Confirming = "publish" | "discard" | "unpublish" | null;

/**
 * Everything that can be done to the record, behind one menu beside its
 * title. The badge beside the code already says
 * whether it is published or drafted, so only whether the edits are saved is
 * reported here.
 */
export function RecordActions({
  sync,
  canWrite,
}: {
  sync: CatalogueSyncTarget | null;
  canWrite: boolean;
}) {
  return canWrite ? (
    <EditableRecordActions sync={sync} />
  ) : sync ? (
    <SyncOnlyActions sync={sync} />
  ) : null;
}

type Sync = ReturnType<typeof useCatalogueSync>;

/**
 * The sync is followed by the menu's owner, not the item, because the item
 * unmounts whenever the menu closes and would stop watching the sync.
 */
function SyncItem({ sync }: { sync: Sync }) {
  const { start, cancel, busy, isActive, label } = sync;
  if (isActive) {
    return (
      <>
        <DropdownMenuItem disabled>
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Syncing from ANU
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={cancel}>
          <CircleStop aria-hidden="true" /> Stop sync
        </DropdownMenuItem>
      </>
    );
  }
  return (
    <DropdownMenuItem disabled={busy} onSelect={start}>
      <RefreshCw aria-hidden="true" />
      {label}
    </DropdownMenuItem>
  );
}

function MenuTrigger() {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="icon" aria-label="Record actions">
        <Ellipsis aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function SyncOnlyActions({ sync }: { sync: CatalogueSyncTarget }) {
  const following = useCatalogueSync(sync);
  return (
    <DropdownMenu>
      <MenuTrigger />
      <DropdownMenuContent align="end" className="min-w-44">
        <SyncItem sync={following} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditableRecordActions({ sync }: { sync: CatalogueSyncTarget | null }) {
  // Hooks run unconditionally; with no sync target the item is not offered.
  const following = useCatalogueSync(
    sync ?? {
      recordId: 0,
      code: "",
      kind: "course",
      latestSync: null,
      hasSynced: false,
    },
  );
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
  const [confirming, setConfirming] = useState<Confirming>(null);
  const busy = dirty || saveState === "saving";
  const failed = saveState === "error" || saveState === "conflict";
  const drafting = hasDraft || editing;
  const close = (open: boolean) => {
    if (!open) setConfirming(null);
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-sm text-muted-foreground"
        role={failed ? "alert" : "status"}
        aria-live="polite"
      >
        {saveState === "saving" ? (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Saving...
          </span>
        ) : failed ? (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {saveState === "conflict"
              ? "This draft changed elsewhere"
              : `Unable to save${saveError ? `: ${saveError}` : ""}`}
          </span>
        ) : editing ? (
          <span className="inline-flex items-center gap-1.5">
            <Check
              className="size-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            Saved
          </span>
        ) : null}
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
      <DropdownMenu>
        <MenuTrigger />
        <DropdownMenuContent align="end" className="min-w-48">
          {!editing ? (
            <DropdownMenuItem onSelect={beginEditing}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
          ) : null}
          {drafting ? (
            <DropdownMenuItem
              disabled={!hasUnpublishedChanges || busy || failed}
              onSelect={() => setConfirming("publish")}
            >
              <Send aria-hidden="true" /> Publish
            </DropdownMenuItem>
          ) : null}
          {sync ? <SyncItem sync={following} /> : null}
          {drafting || isPublished ? <DropdownMenuSeparator /> : null}
          {drafting ? (
            // A draft not yet opened on the server holds nothing, so backing
            // out of it is only leaving the editor and asks nothing.
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={() =>
                hasDraft ? setConfirming("discard") : cancelEditing()
              }
            >
              <Trash2 aria-hidden="true" /> Discard draft
            </DropdownMenuItem>
          ) : null}
          {isPublished ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirming("unpublish")}
            >
              <EyeOff aria-hidden="true" /> Unpublish
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming === "publish"}
        onOpenChange={close}
        title="Publish these changes?"
        description="The saved draft will become the student-visible version. The currently published version stays live until publication succeeds."
        confirmLabel="Publish"
        onConfirm={publish}
      />
      <ConfirmDialog
        open={confirming === "discard"}
        onOpenChange={close}
        title="Discard this draft?"
        description={`${
          isPublished
            ? "The editor goes back to the published version."
            : "The editor goes back to an unpublished, empty record."
        }${
          hasUnpublishedChanges
            ? " A restorable checkpoint of the draft will be kept in the changelog."
            : " Nothing has been changed in it, so nothing is kept."
        }`}
        confirmLabel="Discard draft"
        destructive
        onConfirm={discard}
      />
      <ConfirmDialog
        open={confirming === "unpublish"}
        onOpenChange={close}
        title="Unpublish this record?"
        description="Students will no longer see this record for this year. Versions and draft work will be retained."
        confirmLabel="Unpublish"
        destructive
        onConfirm={unpublish}
      />
    </div>
  );
}
