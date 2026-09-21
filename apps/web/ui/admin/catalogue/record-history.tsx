import { Badge } from "@coursemap/ui/components/badge";
import { FileClock, Send, Undo2 } from "lucide-react";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RecordHistory({ record }: { record: CatalogueRecord }) {
  const events = [
    ...record.versions.map((version) => ({
      id: `version-${version.id}`,
      at: version.createdAt,
      kind: "version" as const,
      title: `Version ${version.id} created`,
      detail:
        version.origin === "import" ? "Synced from ANU" : "Created manually",
    })),
    ...record.publications.flatMap((publication, index) => [
      {
        id: `published-${index}`,
        at: publication.publishedAt,
        kind: "published" as const,
        title: `Version ${publication.versionId} published`,
        detail: null,
      },
      ...(publication.unpublishedAt
        ? [
            {
              id: `unpublished-${index}`,
              at: publication.unpublishedAt,
              kind: "unpublished" as const,
              title: `Version ${publication.versionId} unpublished`,
              detail: null,
            },
          ]
        : []),
    ]),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

  if (events.length === 0)
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <h2 className="font-semibold">No changelog entries yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Versions and publication activity will appear here.
        </p>
      </div>
    );

  return (
    <ol className="space-y-4" aria-label="Changelog">
      {events.map((event) => {
        const Icon =
          event.kind === "published"
            ? Send
            : event.kind === "unpublished"
              ? Undo2
              : FileClock;
        return (
          <li key={event.id} className="flex gap-3 rounded-lg border p-4">
            <Icon
              className="mt-0.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{event.title}</h2>
                {event.kind !== "version" ? (
                  <Badge variant="outline">
                    {event.kind === "published" ? "Published" : "Unpublished"}
                  </Badge>
                ) : null}
              </div>
              {event.detail ? (
                <p className="text-sm text-muted-foreground">{event.detail}</p>
              ) : null}
              <time
                className="text-xs text-muted-foreground"
                dateTime={event.at}
              >
                {formatDateTime(event.at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
