"use client";

import { EyeOff, RefreshCw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  discardDraftAction,
  publishDraftAction,
  unpublishAction,
  type DraftActionResult,
} from "@/lib/coursemap/admin-catalogue-actions";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueDirectoryRecord,
  type CatalogueKind,
  adminCatalogueRecordPath,
  publicCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { anuSourceUrl } from "@/ui/admin/catalogue/anu-source";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";

type DraftAction = "publish" | "discard" | "unpublish";

/**
 * What can be done to one directory row without opening it. The menu is the
 * shared row menu the other admin tables use, so the button lands in the same
 * place and reads the same way; only the entries differ.
 *
 * The student view is offered only once a record is published, because that is
 * the only state the public page will render. Publishing and discarding appear
 * only against a row that actually holds a draft, and unpublishing only
 * against one students can currently see, so the menu never names an action
 * that would fail the moment it was chosen.
 */
export function DirectoryRowActions({
  academicYear,
  kind,
  record,
}: {
  academicYear: number;
  kind: CatalogueKind;
  record: CatalogueDirectoryRecord;
}) {
  const labels = CATALOGUE_KIND_LABELS[kind];
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState<DraftAction | null>(null);
  const busy = syncing || record.sourceState === "syncing";
  const kindLabel = labels.singular.toLowerCase();
  const recordPath = adminCatalogueRecordPath(kind, academicYear, record.code);
  const publishedRecord = { kind, academicYear, code: record.code };
  // A row acts on the draft the list last read. Publishing or discarding a
  // revision that has since moved on is refused by the action rather than
  // overwriting whoever is editing it in another tab.
  const draftActionable =
    record.hasDraft &&
    record.recordId !== null &&
    record.draftRevision !== null;
  const unpublishable = record.isPublished && record.recordId !== null;

  async function startSync() {
    if (record.recordId === null) {
      toast.error("Refresh the ANU listing before syncing this record.");
      return;
    }
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/catalogue-syncs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: record.recordId, kind }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(result.error ?? "The ANU sync could not start.");
        return;
      }
      toast.success(`Syncing ${record.code} from ANU...`);
      router.refresh();
    } catch {
      toast.error("The ANU sync could not start.");
    } finally {
      setSyncing(false);
    }
  }

  async function runDraftAction(action: DraftAction) {
    const recordId = record.recordId as number;
    const editingSessionId = crypto.randomUUID();
    let result: DraftActionResult;
    if (action === "publish")
      result = await publishDraftAction({
        recordId,
        expectedRevision: record.draftRevision as number,
        editingSessionId,
        path: recordPath,
        record: publishedRecord,
      });
    else if (action === "discard")
      result = await discardDraftAction({
        recordId,
        expectedRevision: record.draftRevision as number,
        editingSessionId,
        path: recordPath,
      });
    else
      result = await unpublishAction({
        recordId,
        editingSessionId,
        path: recordPath,
        record: publishedRecord,
      });
    if (result.ok) toast.success(result.message ?? "Done.");
    else toast.error(result.error);
    // Even a refusal refreshes: the row is out of date either way, and the
    // menu it offers has to match what the record now is.
    router.refresh();
  }

  const confirmations: Record<
    DraftAction,
    { title: string; description: string; confirmLabel: string }
  > = {
    publish: {
      title: `Publish ${record.code}?`,
      description: `The saved draft becomes the version students see for ${academicYear}.`,
      confirmLabel: "Publish",
    },
    discard: {
      title: `Discard the draft of ${record.code}?`,
      description: record.isPublished
        ? `The ${kindLabel} goes back to its published version. A restorable checkpoint of the draft is kept in the changelog.`
        : `The ${kindLabel} goes back to being unpublished, with nothing drafted. A restorable checkpoint of the draft is kept in the changelog.`,
      confirmLabel: "Discard draft",
    },
    unpublish: {
      title: `Unpublish ${record.code}?`,
      description: `Students will no longer see this ${kindLabel} for ${academicYear}. Versions and draft work are retained.`,
      confirmLabel: "Unpublish",
    },
  };

  return (
    <>
      {confirming ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          destructive={confirming !== "publish"}
          title={confirmations[confirming].title}
          description={confirmations[confirming].description}
          confirmLabel={confirmations[confirming].confirmLabel}
          onConfirm={() => runDraftAction(confirming)}
        />
      ) : null}
      <CatalogueRowActions
        code={record.code}
        label={record.title ?? record.code}
        links={[
          {
            label: `Open ${kindLabel}`,
            href: recordPath,
          },
          {
            label: "View on ANU",
            href: anuSourceUrl({ kind, code: record.code, academicYear }),
            icon: "source",
          },
          ...(record.isPublished
            ? [
                {
                  label: "Preview as student",
                  href: publicCatalogueRecordPath(
                    kind,
                    academicYear,
                    record.code,
                  ),
                },
              ]
            : []),
        ]}
        extraActions={[
          {
            label: busy
              ? "Syncing from ANU..."
              : record.sourceState === "sync_failed"
                ? "Retry ANU sync"
                : "Sync from ANU",
            icon: <RefreshCw className={busy ? "animate-spin" : undefined} />,
            onSelect: () => {
              if (!busy) void startSync();
            },
          },
          ...(draftActionable
            ? [
                {
                  label: "Publish draft",
                  icon: <Send />,
                  onSelect: () => setConfirming("publish"),
                },
                {
                  label: "Discard draft",
                  icon: <Trash2 />,
                  onSelect: () => setConfirming("discard"),
                },
              ]
            : []),
          ...(unpublishable
            ? [
                {
                  label: "Unpublish",
                  icon: <EyeOff />,
                  onSelect: () => setConfirming("unpublish"),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
