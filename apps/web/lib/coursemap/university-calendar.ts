/**
 * Pure view helpers for the university key-dates calendar. This module has no
 * React, Supabase or server dependencies so it can be unit tested directly.
 */

export type UniversityCalendarCategory =
  | "teaching"
  | "examinations"
  | "enrolment"
  | "graduation"
  | "holiday"
  | "campus";

/** A raw imported calendar entry; `date` is an ISO day such as 2026-03-23. */
export type UniversityCalendarEventRecord = {
  id: number;
  date: string;
  title: string;
};

export type UniversityCalendarEvent = UniversityCalendarEventRecord & {
  category: UniversityCalendarCategory;
};

/** Events for one month; `key` is YYYY-MM and `label` reads like "March 2026". */
export type UniversityCalendarMonth<
  Event extends { date: string } = UniversityCalendarEvent,
> = {
  key: string;
  label: string;
  events: Event[];
};

export const UNIVERSITY_CALENDAR_CATEGORIES: Array<{
  value: UniversityCalendarCategory;
  label: string;
}> = [
  { value: "teaching", label: "Teaching" },
  { value: "examinations", label: "Examinations" },
  { value: "enrolment", label: "Enrolment and fees" },
  { value: "graduation", label: "Graduation" },
  { value: "holiday", label: "Holidays" },
  { value: "campus", label: "Campus" },
];

/** Keyword rules applied in order; the first matching rule wins. */
const CATEGORY_RULES: Array<{
  category: UniversityCalendarCategory;
  pattern: RegExp;
}> = [
  { category: "holiday", pattern: /public holiday|university offices/i },
  { category: "examinations", pattern: /examination|exam period|results/i },
  {
    category: "enrolment",
    pattern:
      /census|enrol|add .*courses|drop .*courses|tuition fees|hecs|payment/i,
  },
  { category: "graduation", pattern: /graduation/i },
  {
    category: "teaching",
    pattern: /semester|session|teaching break|orientation/i,
  },
];

export function categoriseUniversityCalendarEvent(
  title: string,
): UniversityCalendarCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(title)) return rule.category;
  }
  return "campus";
}

/** Adds a category to each record and sorts by date, then title. */
export function decorateUniversityCalendarEvents(
  records: UniversityCalendarEventRecord[],
): UniversityCalendarEvent[] {
  return records
    .map((record) => ({
      ...record,
      category: categoriseUniversityCalendarEvent(record.title),
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return 0;
    });
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Builds "March 2026" from a YYYY-MM key with plain string arithmetic. */
function monthLabel(key: string): string {
  const year = key.slice(0, 4);
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return `${MONTH_LABELS[monthIndex] ?? key} ${year}`;
}

/** Groups already-sorted events into chronological YYYY-MM buckets. */
export function groupUniversityCalendarEventsByMonth<
  Event extends { date: string },
>(events: Event[]): UniversityCalendarMonth<Event>[] {
  const buckets = new Map<string, Event[]>();
  for (const event of events) {
    const key = event.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      buckets.set(key, [event]);
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, monthEvents]) => ({
      key,
      label: monthLabel(key),
      events: monthEvents,
    }));
}

/** Returns the first `limit` events on or after `todayIso` (YYYY-MM-DD). */
export function upcomingUniversityCalendarEvents(
  events: UniversityCalendarEvent[],
  todayIso: string,
  limit: number,
): UniversityCalendarEvent[] {
  return events.filter((event) => event.date >= todayIso).slice(0, limit);
}
