import Link from "next/link";
import {
  CHANGELOG_PAGE_SIZE,
  type CatalogueChangelog,
} from "@/lib/catalogue/changelog";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { ChangelogEntry } from "./changelog-entry";

function dayKey(value: string) {
  return new Date(value).toDateString();
}

function dayLabel(value: string, today: Date) {
  const day = new Date(value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "Today";
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "long" }).format(day);
}

/**
 * The record's history as one story, newest first, grouped by day. Versions
 * that can be opened link out to their own page rather than being rendered as
 * a database row here.
 */
export function ChangelogTimeline({
  changelog,
  path,
  syncsHref = null,
  versionOrdinals,
  today = new Date(),
}: {
  changelog: CatalogueChangelog;
  path: string;
  /** Null for a reader without the permission to see catalogue operations. */
  syncsHref?: string | null;
  versionOrdinals: ReadonlyMap<number, number>;
  today?: Date;
}) {
  if (changelog.entries.length === 0) {
    return (
      <CatalogueEmpty
        title="Nothing has happened yet"
        description="Edits, ANU syncs and publications will appear here as they happen."
      />
    );
  }

  const days: Array<{
    key: string;
    label: string;
    entries: typeof changelog.entries;
  }> = [];
  for (const entry of changelog.entries) {
    const key = dayKey(entry.at);
    const current = days[days.length - 1];
    if (current?.key === key) current.entries.push(entry);
    else days.push({ key, label: dayLabel(entry.at, today), entries: [entry] });
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section className="flex flex-col gap-3" key={day.key}>
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            {day.label}
          </h2>
          <ol
            className="flex flex-col gap-3"
            aria-label={`Changelog for ${day.label}`}
          >
            {day.entries.map((entry) => (
              <ChangelogEntry
                entry={entry}
                key={entry.id}
                syncsHref={syncsHref}
                versionHref={
                  entry.versionId && versionOrdinals.has(entry.versionId)
                    ? `${path}/changelog/${versionOrdinals.get(entry.versionId)}`
                    : null
                }
              />
            ))}
          </ol>
        </section>
      ))}
      {changelog.hasMore ? (
        <Link
          className="self-start text-sm font-medium underline-offset-4 hover:underline"
          href={`${path}/changelog?events=${changelog.shown + CHANGELOG_PAGE_SIZE}`}
        >
          Show earlier history
        </Link>
      ) : null}
    </div>
  );
}
