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
          <Link
            href={`/societies/events/${event.id}`}
            aria-label={`View ${event.title}`}
            className={`group flex h-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-0 dark:hover:ring-1 dark:focus-visible:ring-2 ${layout === "single" ? "sm:flex-row" : ""}`}
          >
            <div
              className={
                layout === "single" ? "sm:w-1/2 sm:shrink-0" : undefined
              }
            >
              <EventArtwork event={event} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="space-y-3">
                <time
                  dateTime={event.startsAt}
                  className="text-xs font-medium text-muted-foreground"
                >
                  {formatEventDate(event.startsAt)}
                </time>
                <h3 className="flex min-h-11 items-start gap-3 text-base leading-snug font-semibold">
                  <span className="line-clamp-2 flex-1">{event.title}</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground"
                  />
                </h3>
                <div className="flex min-h-10 items-center gap-2.5 text-sm text-muted-foreground">
                  {event.society && (
                    <SocietyEmblem society={event.society} small />
                  )}
                  <p className="line-clamp-2">{event.host}</p>
                </div>
              </div>
              <p className="mt-auto flex min-h-8 items-start gap-2 text-xs text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="line-clamp-2 min-w-0 flex-1">
                  {event.location}
                </span>
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
