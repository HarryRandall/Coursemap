import "server-only";
import { cache } from "react";
import { loadSocieties } from "@/lib/societies-data";
import type { Society } from "@/lib/societies";
import { formatEventDate, upcomingSocietyEvents } from "@/lib/society-events";
import {
  decorateUniversityCalendarEvents,
  type UniversityCalendarEvent,
} from "@/lib/coursemap/university-calendar";
import { loadPublishedUniversityCalendar } from "@/lib/coursemap/university-calendar-data";

/** Today in Canberra as an ISO day, the calendar's own time zone. */
export function canberraToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(new Date());
}

/**
 * Published key dates for this year and next, so December still has
 * something coming; none when the calendar cannot load. Cached per request
 * so every part of the landing page shares one load.
 */
export const loadLandingCalendar = cache(
  async (today: string): Promise<UniversityCalendarEvent[]> => {
    const year = Number(today.slice(0, 4));
    try {
      const calendars = await Promise.all([
        loadPublishedUniversityCalendar(year),
        loadPublishedUniversityCalendar(year + 1),
      ]);
      return decorateUniversityCalendarEvents(
        calendars.flatMap((calendar) => calendar.events),
      );
    } catch {
      return [];
    }
  },
);

/** One society row: the society with its next event, or its summary. */
export type LandingSocietyRow = {
  society: Pick<Society, "slug" | "name" | "logoUrl">;
  detail: string;
};

const SOCIETY_ROWS = 3;

/**
 * Three societies for the landing page, logos first: those with an event
 * still to start show it, and the rest fill in with their summary. None
 * when the directory cannot load.
 */
export async function loadLandingSocieties(): Promise<LandingSocietyRow[]> {
  try {
    const { societies, events } = await loadSocieties();
    const withLogo = (slug: string) =>
      Boolean(societies.find((society) => society.slug === slug)?.logoUrl);
    const rows: LandingSocietyRow[] = [];
    const used = new Set<string>();
    const now = new Date();
    // Only events still to start, so a running course never shows a past date.
    const upcoming = upcomingSocietyEvents(events, now)
      .filter((event) => new Date(event.startsAt) > now)
      .sort(
        (left, right) =>
          Number(withLogo(right.societySlug)) -
          Number(withLogo(left.societySlug)),
      );
    for (const event of upcoming) {
      const society = societies.find((item) => item.slug === event.societySlug);
      if (!society || used.has(society.slug)) continue;
      used.add(society.slug);
      rows.push({
        society,
        detail: `${event.title} · ${formatEventDate(event.startsAt)}`,
      });
    }
    const rest = [...societies].sort(
      (left, right) =>
        Number(Boolean(right.logoUrl)) - Number(Boolean(left.logoUrl)),
    );
    for (const society of rest) {
      if (rows.length >= SOCIETY_ROWS) break;
      if (used.has(society.slug)) continue;
      used.add(society.slug);
      rows.push({ society, detail: society.summary });
    }
    return rows.slice(0, SOCIETY_ROWS);
  } catch {
    return [];
  }
}
