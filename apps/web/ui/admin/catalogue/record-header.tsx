"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { ExternalLink, LoaderCircle, Send, Undo2 } from "lucide-react";
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
import { WorkflowBadge } from "./workflow-badge";

function sourceUrl(record: CatalogueRecord) {
  const base = "https://programsandcourses.anu.edu.au";
  if (record.kind === "course")
    return `${base}/${record.academicYear}/course/${record.code}`;
  const segment =
    record.kind === "programme"
      ? "program"
      : record.kind === "specialisation"
        ? "specialisation"
        : record.kind;
  return `${base}/${record.academicYear}/${segment}/${record.code}`;
}

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
  const canPublish =
    record.publishBlockers.length === 0 && record.draftSnapshotId !== null;
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

  return (
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
            href={sourceUrl(record)}
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
          <Button
            disabled={pending || !canPublish}
            type="button"
            title={canPublish ? undefined : record.publishBlockers.join(" ")}
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
        </div>
        {!canPublish && record.publishBlockers.length > 0 ? (
          <p
            className="max-w-sm text-right text-xs text-muted-foreground"
            role="note"
          >
            {record.publishBlockers.join(" ")}
          </p>
        ) : null}
      </div>
    </header>
  );
}
