import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import {
  daysBetween,
  type UniversityCalendarEvent,
} from "@/lib/coursemap/university-calendar";

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

function countdown(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * The published key dates around today as an evenly spaced timeline: the one
 * just passed, then what is coming, with the next one counted down. Spacing
 * is even rather than to scale so close dates never overlap.
 */
export function LandingKeyDates({
  events,
  today,
}: {
  events: readonly UniversityCalendarEvent[];
  /** Today in Canberra, as an ISO day. */
  today: string;
}) {
  const nextIndex = events.findIndex((event) => event.date >= today);
  return (
    <ol
      className="grid gap-y-4 sm:grid-cols-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
      aria-label="Upcoming key dates"
    >
      {events.map((event, index) => {
        const past = nextIndex === -1 || index < nextIndex;
        const next = index === nextIndex;
        return (
          <li
            key={event.id}
            className="enter-rise group/date relative pt-9 pr-4"
            style={delay(150 + index * 80)}
          >
            {/* Each item carries its own piece of the line, so the line
                always runs exactly under the dates shown. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-[18px] right-0 left-0 h-0.5",
                past ? "bg-primary" : "bg-muted",
                index === events.length - 1 && "right-4",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-[13px] left-0 size-3 rounded-full border-2 border-background transition-transform duration-200 group-hover/date:scale-125",
                next
                  ? "bg-amber-500 ring-4 ring-amber-500/20"
                  : past
                    ? "bg-primary"
                    : "bg-muted-foreground/40",
              )}
            />
            {next ? (
              <span className="absolute top-0 left-5 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                {countdown(daysBetween(today, event.date))}
              </span>
            ) : null}
            <p className="font-mono text-[11px] text-muted-foreground">
              <time dateTime={event.date}>
                {dateFormat.format(new Date(event.date))}
              </time>
            </p>
            <p
              className={cn(
                "mt-0.5 line-clamp-2 text-[12px] leading-snug transition-colors group-hover/date:text-foreground",
                next
                  ? "font-semibold text-foreground"
                  : past
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground",
              )}
            >
              {event.title}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
