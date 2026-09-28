import Link from "next/link";
import { MapPin, ArrowUpRight } from "lucide-react";
import { formatEventDate, type SocietyEvent } from "@/lib/society-events";
import { SocietyEmptyState } from "@/ui/societies/society-empty-state";
import { EventArtwork } from "@/ui/societies/event-artwork";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

export function SocietyEvents({
  events,
  past = false,
  layout = "grid",
}: {
  events: SocietyEvent[];
  past?: boolean;
  layout?: "grid" | "single";
}) {
  if (!events.length)
    return (
      <SocietyEmptyState
        kind={past ? "past" : "upcoming"}
        size={layout === "single" ? "compact" : "full"}
      />
    );
  return (
    <ul
      className={
        layout === "single"
          ? "grid gap-5"
          : "grid auto-rows-fr gap-5 sm:grid-cols-2 xl:grid-cols-3"
      }
    >
      {events.map((event) => (
        <li key={event.id} className="min-w-0">
          <article
            className={`group relative flex h-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border hover:ring-foreground/20 dark:ring-0 dark:hover:ring-1 ${layout === "single" ? "sm:flex-row" : ""}`}
          >
            <Link
              href={`/societies/events/${event.id}`}
              aria-label={`View ${event.title}`}
              className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="sr-only">{event.title}</span>
            </Link>
            <div
              className={
                layout === "single"
                  ? "pointer-events-none sm:w-1/2 sm:shrink-0"
                  : "pointer-events-none"
              }
            >
              <EventArtwork event={event} />
            </div>
            <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-3">
              <div className="space-y-3">
                <time
                  dateTime={event.startsAt}
                  className="block text-xs font-medium text-muted-foreground"
                >
                  {formatEventDate(event.startsAt)}
                </time>
                <h3 className="flex min-w-0 items-start gap-3 text-base leading-snug font-semibold">
                  <span className="min-w-0 flex-1 truncate">{event.title}</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground"
                  />
                </h3>
                <Link
                  href={`/societies/${event.societySlug}`}
                  aria-label={`View ${event.host}`}
                  className="pointer-events-auto relative z-10 flex w-fit max-w-full items-center gap-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {event.society && (
                    <SocietyEmblem society={event.society} small />
                  )}
                  <span className="min-w-0 truncate">{event.host}</span>
                </Link>
              </div>
              <p className="mt-auto flex min-h-4 items-start gap-2 text-xs text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {event.location}
                </span>
              </p>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
