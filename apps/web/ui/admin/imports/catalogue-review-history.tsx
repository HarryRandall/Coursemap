import Link from "next/link";
import { Check, Pencil, Upload, Undo2 } from "lucide-react";
import { catalogueFieldLabel } from "@/lib/coursemap/catalogue-proposal-comparison";
export type CatalogueReviewEvent = {
  id: string;
  section: string;
  approved: boolean;
  method: string;
  actor: string;
  createdAt: string;
  versionId: string | null;
};

export function CatalogueReviewHistory({
  events,
  workspaceHref,
}: {
  events: CatalogueReviewEvent[];
  workspaceHref: string;
}) {
  if (!events.length) return null;
  const groups: { event: CatalogueReviewEvent; sections: string[] }[] = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (
      previous &&
      previous.event.actor === event.actor &&
      previous.event.versionId === event.versionId &&
      previous.event.method === event.method &&
      previous.event.approved === event.approved &&
      Math.abs(
        Date.parse(previous.event.createdAt) - Date.parse(event.createdAt),
      ) < 300_000
    ) {
      if (!previous.sections.includes(event.section))
        previous.sections.push(event.section);
    } else groups.push({ event, sections: [event.section] });
  }
  return (
    <details className="group">
      <summary className="cursor-pointer py-2 text-sm font-medium">
        Review activity{" "}
        <span className="ml-2 font-normal text-muted-foreground">
          {groups.length}
        </span>
      </summary>
      <ol
        className="mt-4 ml-4 border-l border-border pl-7"
        aria-label="Review activity"
      >
        {groups.map(({ event, sections }) => {
          const Icon =
            event.method === "published"
              ? Upload
              : event.method === "content_changed"
                ? Pencil
                : event.approved
                  ? Check
                  : Undo2;
          const title =
            event.method === "published"
              ? "Published"
              : event.method === "content_changed"
                ? "Content edited"
                : event.approved
                  ? `${sections.length === 1 ? catalogueFieldLabel(sections[0]!) : `${sections.length} sections`} approved`
                  : "Approval removed";
          return (
            <li key={event.id} className="relative pb-5 last:pb-1">
              <span className="absolute -left-11 flex size-8 items-center justify-center rounded-full border bg-background">
                <Icon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{title}</p>
                  {sections.length > 1 && event.method !== "published" ? (
                    <p className="text-xs text-muted-foreground">
                      {sections.map(catalogueFieldLabel).join(", ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {event.actor}
                    {event.method === "bulk"
                      ? " · Verified sections"
                      : ""} ·{" "}
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString("en-AU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </p>
                </div>
                {event.versionId ? (
                  <Link
                    className="text-xs text-muted-foreground hover:text-foreground"
                    href={`${workspaceHref}/versions/${event.versionId}`}
                  >
                    View version
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
