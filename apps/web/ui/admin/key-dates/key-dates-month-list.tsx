import { Minus, PenLine, Plus } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { cn } from "@/lib/cn";
import { groupUniversityCalendarEventsByMonth } from "@/lib/coursemap/university-calendar";
import type { UniversityCalendarReviewEvent } from "@/lib/coursemap/university-calendar-review";
import { KeyDateRowMenu } from "@/ui/admin/key-dates/key-date-row-menu";
import {
  CategoryBadge,
  calendarDateLabel,
} from "@/ui/key-dates/category-badge";

function RowBadges({
  event,
  showChanges,
}: {
  event: UniversityCalendarReviewEvent;
  showChanges: boolean;
}) {
  return (
    <>
      {showChanges && event.change === "added" ? (
        <Badge variant="success-light">
          <Plus aria-hidden="true" size={12} />
          New
        </Badge>
      ) : null}
      {showChanges && event.change === "removed" ? (
        <Badge variant="destructive-light">
          <Minus aria-hidden="true" size={12} />
          Removed
        </Badge>
      ) : null}
      {event.manual ? (
        <Badge variant="outline">
          <PenLine aria-hidden="true" size={12} />
          Manual
        </Badge>
      ) : null}
      <CategoryBadge category={event.category} />
    </>
  );
}

/**
 * Key dates grouped by month, in the same shape students see them. With
 * `showChanges` each row also says whether approval adds or removes it.
 * `editable` adds a menu to each row; pass the review id so dates that only
 * exist in that sync can be corrected too.
 */
export function KeyDatesMonthList({
  editable,
  events,
  showChanges = false,
}: {
  editable?: { year: number; reviewId?: string };
  events: UniversityCalendarReviewEvent[];
  showChanges?: boolean;
}) {
  const months = groupUniversityCalendarEventsByMonth(events);

  return (
    <div className="space-y-3">
      {months.map((month) => (
        <section
          key={month.key}
          aria-labelledby={`key-dates-month-${month.key}`}
          className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5 lg:flex-col lg:justify-start lg:gap-1 lg:border-r lg:border-b-0 lg:py-4">
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
                  className="flex items-center gap-3 py-2.5 pr-2 pl-4"
                >
                  <time
                    dateTime={event.date}
                    className="flex w-9 shrink-0 flex-col text-muted-foreground"
                  >
                    <span className="text-[11px] leading-tight">
                      {calendarDateLabel(event.date, { weekday: "short" })}
                    </span>
                    <span className="text-lg leading-tight font-semibold text-foreground tabular-nums">
                      {event.date.slice(8)}
                    </span>
                  </time>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:justify-between md:gap-4">
                    <p
                      className={cn(
                        "min-w-0 text-sm leading-snug font-medium",
                        removed && "text-muted-foreground line-through",
                      )}
                    >
                      {event.title}
                    </p>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <RowBadges event={event} showChanges={showChanges} />
                    </div>
                  </div>
                  {editable ? (
                    <div className="w-8 shrink-0">
                      <KeyDateRowMenu
                        event={event}
                        reviewId={editable.reviewId}
                        year={editable.year}
                      />
                    </div>
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
