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
};

export type UniversityCalendarReviewDiff = {
  events: UniversityCalendarReviewEvent[];
  added: number;
  removed: number;
  unchanged: number;
};

type CalendarEntry = { date: string; title: string };

function entryKey(entry: CalendarEntry) {
  return `${entry.date}|${entry.title}`;
}

/**
 * Every synced date plus every published date the sync no longer lists,
 * sorted by date then title. Approval archives the removed dates rather than
 * deleting them, which is what "removed" means to a student.
 */
export function diffUniversityCalendarReview(
  synced: readonly CalendarEntry[],
  published: readonly CalendarEntry[],
): UniversityCalendarReviewDiff {
  const publishedKeys = new Set(published.map(entryKey));
  const syncedKeys = new Set<string>();
  const events: UniversityCalendarReviewEvent[] = [];

  for (const entry of synced) {
    const key = entryKey(entry);
    if (syncedKeys.has(key)) continue;
    syncedKeys.add(key);
    events.push({
      key,
      date: entry.date,
      title: entry.title,
      category: categoriseUniversityCalendarEvent(entry.title),
      change: publishedKeys.has(key) ? "unchanged" : "added",
    });
  }

  for (const entry of published) {
    const key = entryKey(entry);
    if (syncedKeys.has(key)) continue;
    syncedKeys.add(key);
    events.push({
      key,
      date: entry.date,
      title: entry.title,
      category: categoriseUniversityCalendarEvent(entry.title),
      change: "removed",
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
