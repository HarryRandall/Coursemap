import { ACADEMIC_TIME_ZONE } from "@/lib/canberra-format";
import type { Society } from "@/lib/societies";

export type SocietyEvent = {
  id: string;
  sourceId: string;
  category: "workshop" | "social" | "gaming";
  title: string;
  host: string;
  hostProfileUrl: string;
  societySlug: string;
  society?: Society;
  startsAt: string;
  endsAt: string;
  location: string;
  sourceUrl: string;
  description: string;
  artworkUrl?: string;
  ticketsUrl?: string;
};

export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ACADEMIC_TIME_ZONE,
  }).format(new Date(value));
}

export function upcomingSocietyEvents(
  events: SocietyEvent[],
  now: Date,
  societySlug?: string,
): SocietyEvent[] {
  return events
    .filter(
      (event) =>
        new Date(event.endsAt).getTime() > now.getTime() &&
        (!societySlug || event.societySlug === societySlug),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
}
