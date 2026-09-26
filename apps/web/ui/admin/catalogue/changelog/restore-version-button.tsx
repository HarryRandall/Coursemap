"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreCatalogueVersionAction } from "@/lib/coursemap/admin-catalogue-actions";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { showToast } from "@/ui/common/toast";

/**
 * Restores historical content as the working draft. The version itself never
 * changes, which is why this is not called a revert, and a draft it would
 * replace becomes a version of its own first.
 */
export function RestoreVersionButton({
  recordId,
  versionId,
  draftRevision,
  path,
  label = "Restore as draft",
}: {
  recordId: number;
  versionId: number;
  /** The current draft's revision, or null when the record has no draft. */
  draftRevision: number | null;
  path: string;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function restore() {
    startTransition(async () => {
      const result = await restoreCatalogueVersionAction({
        recordId,
        versionId,
        expectedRevision: draftRevision,
        replaceExistingDraft: draftRevision !== null,
        editingSessionId: crypto.randomUUID(),
        path,
      });
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(result.message ?? "Version restored as a draft");
      setOpen(false);
      router.push(path);
      router.refresh();
    });
  }

  if (draftRevision === null) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={restore}
      >
        {label}
      </Button>
    );
  }

  return (
    <ConfirmDialog
      confirmLabel={label}
      description="Restoring this version will replace your current draft. Your current draft will be preserved in the Changelog."
      onConfirm={restore}
      onOpenChange={setOpen}
      open={open}
      title="Replace the current draft?"
      trigger={
        <Button type="button" variant="outline" disabled={isPending}>
          {label}
        </Button>
      }
    />
  );
}
