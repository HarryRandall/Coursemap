import { Badge } from "@coursemap/ui/components/badge";
import { ExternalLink, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { anuSourceUrl } from "./anu-source";

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
}: {
  record: CatalogueRecord;
  hasDraft: boolean;
  hasUnpublishedChanges: boolean;
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
        <p className="text-lg text-muted-foreground">{record.title}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {record.isListedByAnu === false ? (
            <span
              className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
              role="status"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              No longer listed by ANU
              {record.lastSeenAt
                ? `. Last seen in the ANU catalogue on ${formatDate(record.lastSeenAt)}.`
                : "."}
            </span>
          ) : record.isListedByAnu ? (
            <span className="text-muted-foreground">Listed by ANU</span>
          ) : (
            <span className="text-muted-foreground">
              No ANU listing information
            </span>
          )}
          <Link
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            href={anuSourceUrl(record)}
            target="_blank"
            rel="noreferrer"
          >
            View on ANU <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>
        <span className="sr-only">{labels.singular} record</span>
      </div>
    </header>
  );
}
