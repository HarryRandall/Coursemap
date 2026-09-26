import { Badge } from "@coursemap/ui/components/badge";
import { ExternalLink, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { anuSourceUrl } from "./anu-source";
import { RecordActions } from "./record-actions";
import { FailedSyncAlert, RecordSyncProvider } from "./record-sync";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(
    new Date(value),
  );
}

export function RecordHeader({
  record,
  hasDraft,
  hasUnpublishedChanges,
  canSync,
  canWrite,
}: {
  record: CatalogueRecord;
  hasDraft: boolean;
  hasUnpublishedChanges: boolean;
  canSync: boolean;
  canWrite: boolean;
}) {
  const labels = CATALOGUE_KIND_LABELS[record.kind];
  const publicationLabel = record.publishedVersionId
    ? hasUnpublishedChanges
      ? "Published · Unpublished changes"
      : "Published"
    : hasDraft
      ? "Not published · Draft"
      : "Not published";
  const failedSync =
    record.syncs[0]?.status === "failed" ? record.syncs[0] : null;
  const content = (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {record.code}
            </h1>
            <Badge variant="outline">{record.academicYear}</Badge>
            <Badge
              variant={record.publishedVersionId ? "success-light" : "outline"}
            >
              {publicationLabel}
            </Badge>
          </div>
          {/*
          Being listed by ANU is the resting state of every record here, so
          saying so on each one said nothing. Only the delisting is worth a
          line, and the title itself opens the ANU page.
        */}
          <Link
            className="inline-flex w-fit items-center gap-1.5 text-lg text-foreground underline-offset-4 hover:text-primary hover:underline"
            href={anuSourceUrl(record)}
            target="_blank"
            rel="noreferrer"
          >
            {record.title}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only">(opens on ANU)</span>
          </Link>
          {record.isListedByAnu === false ? (
            <span
              className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400"
              role="status"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              No longer listed by ANU
              {record.lastSeenAt
                ? `. Last seen in the ANU catalogue on ${formatDate(record.lastSeenAt)}.`
                : "."}
            </span>
          ) : null}
          {/* Open changes are counted on the Changes tab itself. */}
          {record.syncs[0]?.status === "unchanged" ? (
            <p className="text-sm text-muted-foreground">
              Checked ANU. No changes found.
            </p>
          ) : null}
          <span className="sr-only">{labels.singular} record</span>
        </div>
        <RecordActions canWrite={canWrite} />
      </header>
      {failedSync ? (
        <FailedSyncAlert
          errorCode={failedSync.errorCode}
          errorMessage={failedSync.errorMessage}
          failedAt={failedSync.completedAt}
        />
      ) : null}
    </div>
  );
  return canSync ? (
    <RecordSyncProvider
      target={{
        recordId: record.recordId,
        code: record.code,
        kind: record.kind,
        latestSync: record.syncs[0] ?? null,
        // A record whose draft was discarded holds nothing from ANU any more,
        // so reading it again is a first sync.
        hasSynced:
          record.sourceCheckedAt !== null &&
          (hasDraft || record.publishedVersionId !== null),
      }}
    >
      {content}
    </RecordSyncProvider>
  ) : (
    content
  );
}
