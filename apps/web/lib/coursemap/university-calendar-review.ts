/**
 * Compares a synced university calendar with the dates students currently
 * see. Pure so the review screen and its tests agree on what a sync changes.
 */

import {
  categoriseUniversityCalendarEvent,
  type UniversityCalendarCategory,
} from "@/lib/coursemap/university-calendar";

export type UniversityCalendarChange = "added" | "removed" | "unchanged";

export type UniversityCalendarReviewEvent = {
  /** Stable within one review: the date and title joined. */
  key: string;
  date: string;
  title: string;
  category: UniversityCalendarCategory;
  change: UniversityCalendarChange;
  /** Added or edited by hand; a sync never removes it. */
  manual: boolean;
  /** The published row, when the date is already published. */
  eventId?: number;
};

export type UniversityCalendarReviewDiff = {
  events: UniversityCalendarReviewEvent[];
  added: number;
  removed: number;
  unchanged: number;
};

type CalendarEntry = { date: string; title: string; manual?: boolean };

type PublishedEntry = CalendarEntry & {
  id?: number;
  origin?: "anu" | "manual";
};

function entryKey(entry: CalendarEntry) {
  return `${entry.date}|${entry.title}`;
}

/**
 * Every synced date plus every published date the sync no longer lists,
 * sorted by date then title. Approval archives the removed dates rather than
 * deleting them, which is what "removed" means to a student. Dates added or
 * edited by hand stay published whatever the sync says, so they are never
 * counted as removed.
 */
export function diffUniversityCalendarReview(
  synced: readonly CalendarEntry[],
  published: readonly PublishedEntry[],
): UniversityCalendarReviewDiff {
  const publishedByKey = new Map(
    published.map((entry) => [entryKey(entry), entry]),
  );
  const syncedKeys = new Set<string>();
  const events: UniversityCalendarReviewEvent[] = [];

  for (const entry of synced) {
    const key = entryKey(entry);
    if (syncedKeys.has(key)) continue;
    syncedKeys.add(key);
    const match = publishedByKey.get(key);
    events.push({
      key,
      date: entry.date,
      title: entry.title,
      category: categoriseUniversityCalendarEvent(entry.title),
      change: match ? "unchanged" : "added",
      manual: entry.manual === true || match?.origin === "manual",
      eventId: match?.id,
    });
  }

  for (const entry of published) {
    const key = entryKey(entry);
    if (syncedKeys.has(key)) continue;
    syncedKeys.add(key);
    const manual = entry.origin === "manual";
    events.push({
      key,
      date: entry.date,
      title: entry.title,
      category: categoriseUniversityCalendarEvent(entry.title),
      change: manual ? "unchanged" : "removed",
      manual,
      eventId: entry.id,
    });
  }

  events.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? -1
        : 1
      : a.title < b.title
        ? -1
        : a.title > b.title
          ? 1
          : 0,
  );

  return {
    events,
    added: events.filter((event) => event.change === "added").length,
    removed: events.filter((event) => event.change === "removed").length,
    unchanged: events.filter((event) => event.change === "unchanged").length,
  };
}
