import type { UniversityCalendarEvent } from "@/lib/coursemap/university-calendar";
import type { SocietyEvent } from "@/lib/society-events";
import type { Society } from "@/lib/societies";

export type KeyDateEvent =
  | UniversityCalendarEvent
  | {
      id: string;
      date: string;
      title: string;
      category: "societies";
      href: string;
      host: string;
      startsAt: string;
      society?: Pick<Society, "slug" | "logoUrl">;
    };

/** Use the event's Canberra day, including dates after daylight saving starts. */
export function societyEventDay(startsAt: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startsAt));
}

export function societyKeyDates(
  events: SocietyEvent[],
  year: number,
): KeyDateEvent[] {
  return events
    .map((event) => ({
      id: event.id,
      date: societyEventDay(event.startsAt),
      title: event.title,
      category: "societies" as const,
      href: `/societies/events/${event.id}`,
      host: event.host,
      startsAt: event.startsAt,
      society: event.society
        ? { slug: event.society.slug, logoUrl: event.society.logoUrl }
        : undefined,
    }))
    .filter((event) => event.date.startsWith(`${year}-`));
}
