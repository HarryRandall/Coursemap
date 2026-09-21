"use client";

import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Download, History, Pencil, Undo2, Upload } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { restoreSnapshotAction } from "@/lib/coursemap/admin-catalogue-actions";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Every snapshot of the record with its role, and the publication log. */
export function RecordHistory({
  record,
  path,
}: {
  record: CatalogueRecord;
  path: string;
}) {
  const targetRun = new Map(
    record.reviews.map((review) => [review.id, review.runNumber]),
  );
  const [pending, startTransition] = useTransition();
  const locked = pending || Boolean(record.archivedAt);
  function run(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error ?? "The action failed.");
    });
  }
  // Snapshots and publications are one story, so they share a timeline rather
  // than sitting in two lists the reader has to interleave by timestamp.
  type HistoryEvent = {
    id: string;
    at: string;
    kind: "snapshot" | "published" | "unpublished";
    origin?: string;
    title: string;
    detail: string | null;
    snapshot: CatalogueRecord["versions"][number] | null;
  };

  const events: HistoryEvent[] = [
    ...record.versions.map((snapshot) => {
      const runNumber = snapshot.importTargetId
        ? targetRun.get(snapshot.importTargetId)
        : undefined;
      const detail = [
        runNumber ? `Run #${runNumber}` : null,
        snapshot.basedOnVersionId
          ? `based on #${snapshot.basedOnVersionId}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        id: `snapshot-${snapshot.id}`,
        at: snapshot.createdAt,
        kind: "snapshot" as const,
        origin: snapshot.origin,
        title:
          snapshot.origin === "import"
            ? `Imported as #${snapshot.id}`
            : `Edited by hand as #${snapshot.id}`,
        detail: detail || null,
        snapshot,
      };
    }),
    ...record.publications.map((publication, index) => ({
      id: `publication-${publication.publishedAt}-${index}`,
      at: publication.publishedAt,
      kind: "published" as const,
      title: "Published",
      detail: `Version #${publication.versionId}`,
      snapshot: null,
    })),
    ...record.publications.flatMap((publication, index) =>
      publication.unpublishedAt
        ? [
            {
              id: `unpublication-${publication.unpublishedAt}-${index}`,
              at: publication.unpublishedAt,
              kind: "unpublished" as const,
              title: "Withdrawn from students",
              detail: `Version #${publication.versionId}`,
              snapshot: null,
            },
          ]
        : [],
    ),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

  if (events.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has been imported, edited or published for this record yet.
      </p>
    );

  return (
    <ol
      className="relative min-w-0 before:absolute before:inset-y-4 before:left-4 before:border-l before:border-border"
      aria-label="Record history"
    >
      {events.map((event) => {
        const Icon =
          event.kind === "published"
            ? Upload
            : event.kind === "unpublished"
              ? Undo2
              : event.origin === "import"
                ? Download
                : Pencil;
        const snapshot = event.snapshot;
        return (
          <li key={event.id} className="relative min-w-0 pb-7 pl-12 last:pb-0">
            <span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border border-border bg-background">
              <Icon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{event.title}</h3>
                  {snapshot?.id === record.publishedVersionId ? (
                    <Badge variant="success-light">Published</Badge>
                  ) : snapshot?.id === record.currentVersionId ? (
                    <Badge variant="outline">Current draft</Badge>
                  ) : null}
                  {snapshot && !snapshot.sealedAt ? (
                    <Badge variant="info-light">Unsealed</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.detail ? `${event.detail} · ` : null}
                  <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                </p>
              </div>
              {snapshot ? (
                <div className="flex gap-2">
                  {snapshot.id !== record.currentVersionId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={locked}
                      type="button"
                      onClick={() =>
                        run(() =>
                          restoreSnapshotAction({
                            recordId: record.recordId,
                            snapshotId: snapshot.id,
                            path,
                          }),
                        )
                      }
                    >
                      <History size={14} aria-hidden="true" />
                      Restore as draft
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
