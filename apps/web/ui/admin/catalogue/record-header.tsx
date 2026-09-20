"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  ExternalLink,
  LoaderCircle,
  Send,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  publishDraftAction,
  unpublishAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { anuSourceUrl } from "./anu-source";
import { WorkflowBadge } from "./workflow-badge";

/** Title, pointers and the publish controls for one record and year. */
export function RecordHeader({
  record,
  path,
}: {
  record: CatalogueRecord;
  path: string;
}) {
  const [pending, startTransition] = useTransition();
  const labels = CATALOGUE_KIND_LABELS[record.kind];
  // Without a draft there is nothing to publish, which is the ordinary state of
  // a finished record rather than a problem, so it is not reported as one. The
  // blockers that remain are the reasons a pending draft is being held back.
  const hasDraft = record.draftSnapshotId !== null;
  const blockers = hasDraft ? record.publishBlockers : [];
  const canPublish = hasDraft && blockers.length === 0;
  const workflow =
    record.publishedSnapshotId && record.draftSnapshotId
      ? "published_with_draft"
      : record.publishedSnapshotId
        ? "published"
        : record.draftSnapshotId
          ? "draft"
          : "not_imported";

  function run(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error ?? "The action failed.");
    });
  }

  const header = (
    <header
      role="banner"
      className="flex flex-wrap items-start justify-between gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-mono text-sm text-muted-foreground">
          {labels.singular} · {record.code} · {record.academicYear}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {record.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <WorkflowBadge status={workflow} />
          {record.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
          <Link
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            href={anuSourceUrl(record)}
            target="_blank"
            rel="noreferrer"
          >
            ANU page
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {record.publishedSnapshotId ? (
            <ConfirmDialog
              title={`Unpublish ${record.code} for ${record.academicYear}?`}
              description="Students will no longer see this record for the year. The content stays in history and can be published again."
              confirmLabel="Unpublish"
              destructive
              onConfirm={() =>
                run(() =>
                  unpublishAction({ itemYearId: record.itemYearId, path }),
                )
              }
              trigger={
                <Button variant="outline" disabled={pending} type="button">
                  <Undo2 size={16} aria-hidden="true" />
                  Unpublish
                </Button>
              }
            />
          ) : null}
          {hasDraft ? (
            <Button
              disabled={pending || !canPublish}
              type="button"
              onClick={() =>
                run(() =>
                  publishDraftAction({ itemYearId: record.itemYearId, path }),
                )
              }
            >
              {pending ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
              Publish draft
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );

  if (blockers.length === 0) return header;

  // Why the draft cannot go live is the most important thing on the page, so it
  // reads as an alert rather than as the faintest line of text on it.
  return (
    <div className="flex flex-col gap-3">
      {header}
      <Alert variant="warning">
        <TriangleAlert className="size-4" aria-hidden="true" />
        <AlertTitle>
          {blockers.length === 1
            ? "The draft cannot be published yet"
            : `${blockers.length} things hold the draft back`}
        </AlertTitle>
        <AlertDescription>
          {blockers.length === 1 ? (
            <p>{blockers[0]}</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
        <AlertAction>
          <Button asChild size="sm" variant="outline">
            <Link href={`${path}&tab=review`}>Open review</Link>
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
