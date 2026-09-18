import { Badge } from "@coursemap/ui/components/badge";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Every snapshot of the record with its role, and the publication log. */
export function RecordHistory({ record }: { record: CatalogueRecord }) {
  const targetRun = new Map(
    record.reviews.map((review) => [review.id, review.runNumber]),
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section
        aria-labelledby="snapshots-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="snapshots-heading" className="text-sm font-semibold">
          Snapshots{" "}
          <span className="font-normal text-muted-foreground">
            {record.snapshots.length}
          </span>
        </h2>
        <ol className="divide-y divide-border rounded-lg border border-border">
          {record.snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">
                #{snapshot.id}
              </span>
              <span>{formatDateTime(snapshot.createdAt)}</span>
              <Badge variant="outline">{snapshot.origin}</Badge>
              {snapshot.importTargetId &&
              targetRun.has(snapshot.importTargetId) ? (
                <span className="text-xs text-muted-foreground">
                  run #{targetRun.get(snapshot.importTargetId)}
                </span>
              ) : null}
              {snapshot.basedOnSnapshotId ? (
                <span className="text-xs text-muted-foreground">
                  based on #{snapshot.basedOnSnapshotId}
                </span>
              ) : null}
              <span className="ml-auto flex gap-1">
                {snapshot.id === record.publishedSnapshotId ? (
                  <Badge variant="success-light">Published</Badge>
                ) : null}
                {snapshot.id === record.draftSnapshotId ? (
                  <Badge variant="warning-light">Draft</Badge>
                ) : null}
                {!snapshot.sealedAt ? (
                  <Badge variant="info-light">Unsealed</Badge>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section
        aria-labelledby="publications-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="publications-heading" className="text-sm font-semibold">
          Publications{" "}
          <span className="font-normal text-muted-foreground">
            {record.publications.length}
          </span>
        </h2>
        {record.publications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Never published.</p>
        ) : (
          <ol className="divide-y divide-border rounded-lg border border-border">
            {record.publications.map((publication, index) => (
              <li
                key={`${publication.publishedAt}-${index}`}
                className="px-3 py-2 text-sm"
              >
                {formatDateTime(publication.publishedAt)}
                <span className="text-muted-foreground">
                  {publication.snapshotId
                    ? ` · snapshot #${publication.snapshotId}`
                    : " · unpublished"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
