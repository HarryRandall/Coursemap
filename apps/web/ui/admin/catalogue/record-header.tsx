import { Badge } from "@coursemap/ui/components/badge";
import { ExternalLink, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";
import {
  CATALOGUE_KIND_LABELS,
  adminCatalogueRecordPath,
} from "@/lib/coursemap/catalogue-kinds";
import { anuSourceUrl } from "./anu-source";
import { CatalogueSyncButton } from "./sync-button";

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
  openChangeCount,
  conflictCount,
}: {
  record: CatalogueRecord;
  hasDraft: boolean;
  hasUnpublishedChanges: boolean;
  canSync: boolean;
  openChangeCount: number;
  conflictCount: number;
}) {
  const labels = CATALOGUE_KIND_LABELS[record.kind];
  const publicationLabel = record.publishedVersionId
    ? hasUnpublishedChanges
      ? "Published · Unpublished changes"
      : "Published"
    : hasDraft
      ? "Not published · Draft"
      : "Not published";
  return (
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
          line, and the source link belongs beside the title it is a link to.
        */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-lg text-muted-foreground">{record.title}</p>
          <Link
            className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            href={anuSourceUrl(record)}
            target="_blank"
            rel="noreferrer"
          >
            View on ANU <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>
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
        {openChangeCount > 0 ? (
          <Link
            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
            href={`${adminCatalogueRecordPath(record.kind, record.academicYear, record.code)}/changes`}
          >
            {conflictCount > 0
              ? `${openChangeCount} ANU ${openChangeCount === 1 ? "change" : "changes"} to review, including ${conflictCount} ${conflictCount === 1 ? "conflict" : "conflicts"}.`
              : `${openChangeCount} ANU ${openChangeCount === 1 ? "change" : "changes"} to review.`}
          </Link>
        ) : record.syncs[0]?.status === "unchanged" ? (
          <p className="text-sm text-muted-foreground">
            Checked ANU. No changes found.
            {canSync ? (
              <>
                {" "}
                <Link
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  href={`/admin/operations/catalogue/syncs/${record.syncs[0].id}`}
                >
                  Sync diagnostics
                </Link>
              </>
            ) : null}
          </p>
        ) : record.syncs[0]?.status === "failed" ? (
          <p className="text-sm text-destructive" role="alert">
            {record.syncs[0].errorMessage ?? "The latest ANU sync failed."}
            {canSync ? (
              <>
                {" "}
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  href={`/admin/operations/catalogue/syncs/${record.syncs[0].id}`}
                >
                  Technical details
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        <span className="sr-only">{labels.singular} record</span>
      </div>
      {canSync ? (
        <CatalogueSyncButton
          recordId={record.recordId}
          code={record.code}
          kind={record.kind}
          latestSync={record.syncs[0] ?? null}
        />
      ) : null}
    </header>
  );
}
