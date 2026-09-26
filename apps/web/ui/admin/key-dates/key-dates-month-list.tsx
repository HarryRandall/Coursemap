import type { ReactNode } from "react";
import { Minus, PenLine, Plus } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { cn } from "@/lib/cn";
import { groupUniversityCalendarEventsByMonth } from "@/lib/coursemap/university-calendar";
import type { UniversityCalendarReviewEvent } from "@/lib/coursemap/university-calendar-review";
import {
  CategoryBadge,
  calendarDateLabel,
} from "@/ui/key-dates/category-badge";

function ChangeBadge({
  change,
}: Pick<UniversityCalendarReviewEvent, "change">) {
  if (change === "added")
    return (
      <Badge variant="success-light">
        <Plus aria-hidden="true" size={12} />
        New
      </Badge>
    );
  if (change === "removed")
    return (
      <Badge variant="destructive-light">
        <Minus aria-hidden="true" size={12} />
        Removed
      </Badge>
    );
  return null;
}

function ManualBadge() {
  return (
    <Badge variant="outline">
      <PenLine aria-hidden="true" size={12} />
      Manual
    </Badge>
  );
}

/**
 * Key dates grouped by month, in the same shape students see them. When
 * `showChanges` is set each row also says whether approval adds or removes
 * it. `actions` renders a control at the end of each row.
 */
export function KeyDatesMonthList({
  actions,
  events,
  showChanges = false,
}: {
  actions?: (event: UniversityCalendarReviewEvent) => ReactNode;
  events: UniversityCalendarReviewEvent[];
  showChanges?: boolean;
}) {
  const months = groupUniversityCalendarEventsByMonth(events);

  return (
    <div className="space-y-4">
      {months.map((month) => (
        <section
          key={month.key}
          aria-labelledby={`key-dates-month-${month.key}`}
          className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3 lg:flex-col lg:items-start lg:justify-start lg:gap-1.5 lg:border-r lg:border-b-0 lg:py-5">
            <h3
              id={`key-dates-month-${month.key}`}
              className="text-sm font-semibold"
            >
              {month.label}
            </h3>
            <span className="text-xs text-muted-foreground">
              {month.events.length}{" "}
              {month.events.length === 1 ? "date" : "dates"}
            </span>
          </div>
          <ol className="divide-y divide-border/60">
            {month.events.map((event) => {
              const removed = showChanges && event.change === "removed";
              return (
                <li
                  key={event.key}
                  className={cn(
                    "grid items-center gap-4 px-4 py-3.5 sm:px-5",
                    actions
                      ? "grid-cols-[3rem_minmax(0,1fr)_auto] md:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto]"
                      : "grid-cols-[3rem_minmax(0,1fr)] md:grid-cols-[3.5rem_minmax(0,1fr)_auto]",
                    showChanges &&
                      event.change === "added" &&
                      "bg-emerald-500/4",
                    removed && "bg-rose-500/4",
                  )}
                >
                  <time
                    dateTime={event.date}
                    className="flex flex-col text-muted-foreground"
                  >
                    <span className="text-[11px]">
                      {calendarDateLabel(event.date, { weekday: "short" })}
                    </span>
                    <span className="text-xl leading-tight font-semibold tracking-tight text-foreground tabular-nums">
                      {event.date.slice(8)}
                    </span>
                  </time>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm leading-relaxed font-medium",
                        removed && "text-muted-foreground line-through",
                      )}
                    >
                      {event.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                      {showChanges ? (
                        <ChangeBadge change={event.change} />
                      ) : null}
                      {event.manual ? <ManualBadge /> : null}
                      <CategoryBadge category={event.category} />
                    </div>
                  </div>
                  <div className="hidden items-center gap-1.5 justify-self-end md:flex">
                    {showChanges ? <ChangeBadge change={event.change} /> : null}
                    {event.manual ? <ManualBadge /> : null}
                    <CategoryBadge category={event.category} />
                  </div>
                  {actions ? (
                    <div className="justify-self-end">{actions(event)}</div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
