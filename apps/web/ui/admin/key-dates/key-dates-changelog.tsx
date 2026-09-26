import {
  CircleCheck,
  CircleX,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { cn } from "@/lib/cn";
import type { KeyDatesChangelogEntry } from "@/lib/admin/key-dates";
import { calendarDateLabel } from "@/ui/key-dates/category-badge";
import { routeIcons } from "@/ui/shell/route-icons";

const timestampFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function shortDate(date: string) {
  return calendarDateLabel(date, { day: "numeric", month: "short" });
}

function describe(entry: KeyDatesChangelogEntry): {
  icon: LucideIcon;
  tone: string;
  summary: string;
  detail?: string;
} {
  if (entry.kind === "publication") {
    if (entry.failed)
      return {
        icon: CircleX,
        tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
        summary: "An ANU import failed and nothing was published",
      };
    const parts = [
      `${entry.added} added`,
      entry.restored ? `${entry.restored} restored` : null,
      `${entry.archived} archived`,
      `${entry.unchanged} unchanged`,
    ].filter(Boolean);
    return {
      icon: CircleCheck,
      tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      summary: entry.fromConsole
        ? "Published an ANU sync"
        : "Published from the command-line importer",
      detail: parts.join(" · "),
    };
  }
  if (entry.kind === "discarded")
    return {
      icon: Undo2,
      tone: "bg-muted text-muted-foreground",
      summary: "Discarded an ANU sync",
      detail: `${entry.dates} dates were not published`,
    };
  if (entry.action === "added")
    return {
      icon: Plus,
      tone: "bg-primary/10 text-primary",
      summary: `Added "${entry.title}"`,
      detail: shortDate(entry.date),
    };
  if (entry.action === "removed")
    return {
      icon: Trash2,
      tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      summary: `Removed "${entry.title}"`,
      detail: shortDate(entry.date),
    };
  const renamed = entry.previousTitle !== entry.title;
  const moved = entry.previousDate !== entry.date;
  return {
    icon: Pencil,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    summary: `Edited "${entry.title}"`,
    detail: [
      renamed ? `was "${entry.previousTitle}"` : null,
      moved && entry.previousDate
        ? `moved from ${shortDate(entry.previousDate)} to ${shortDate(entry.date)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

/** Syncs, discarded syncs and hand edits for the year, newest first. */
export function KeyDatesChangelog({
  entries,
  year,
}: {
  entries: KeyDatesChangelogEntry[];
  year: number;
}) {
  if (entries.length === 0) {
    const Icon = routeIcons.changelog;
    return (
      <Empty className="rounded-xl border py-14">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nothing has changed in {year} yet</EmptyTitle>
          <EmptyDescription>
            Published syncs and dates edited by hand are listed here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ol className="relative space-y-1 before:absolute before:top-4 before:bottom-4 before:left-[1.1875rem] before:w-px before:bg-border">
      {entries.map((entry) => {
        const { icon: Icon, tone, summary, detail } = describe(entry);
        return (
          <li
            key={`${entry.kind}-${entry.id}`}
            className="relative flex gap-3 rounded-lg px-2 py-2.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-background",
                tone,
              )}
            >
              <Icon size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{summary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[detail, entry.actor].filter(Boolean).join(" · ")}
                {detail || entry.actor ? " · " : ""}
                <time dateTime={entry.at}>
                  {timestampFormat.format(new Date(entry.at))}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
