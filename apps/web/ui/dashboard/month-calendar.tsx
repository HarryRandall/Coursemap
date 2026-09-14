"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@coursemap/ui/primitives/tooltip";
import type { DashboardCalendarEvent } from "@/lib/coursemap/dashboard-series";
import { cn } from "@/lib/cn";
import { accent } from "@/lib/ui";

const monthNames = [
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
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type YearMonth = { year: number; month: number };

function atLocalDay(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function monthLabel({ year, month }: YearMonth) {
  return `${monthNames[month]} ${year}`;
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function monthCells({ year, month }: YearMonth) {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day += 1)
    cells.push(new Date(year, month, day));
  return [...cells, ...Array.from({ length: 42 - cells.length }, () => null)];
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function weekdaySlot(code: string) {
  return (
    code.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % 5
  );
}

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function eventsOnDay(day: Date, events: readonly DashboardCalendarEvent[]) {
  if (mondayIndex(day) > 4) return [];
  const dayStart = startOfDay(day);
  return events.filter((event) => {
    const start = atLocalDay(event.startsOn);
    const end = atLocalDay(event.endsOn);
    return (
      start &&
      end &&
      dayStart >= start &&
      dayStart <= end &&
      weekdaySlot(event.courseCode) === mondayIndex(day)
    );
  });
}

function initialMonth(
  events: readonly DashboardCalendarEvent[],
  today: Date,
): YearMonth {
  const dated = events
    .flatMap((event) => {
      const start = atLocalDay(event.startsOn);
      const end = atLocalDay(event.endsOn);
      return start && end ? [{ start, end }] : [];
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const current = dated.find(
    ({ start, end }) => today >= start && today <= end,
  );
  const next = dated.find(({ start }) => start >= today);
  const selected = current?.start ?? next?.start ?? dated[0]?.start ?? today;
  return { year: selected.getFullYear(), month: selected.getMonth() };
}

export function MonthCalendar({
  events,
}: {
  events: readonly DashboardCalendarEvent[];
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [focus, setFocus] = useState(() => initialMonth(events, today));
  const cells = monthCells(focus);

  return (
    <Card className="h-full py-0">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{monthLabel(focus)}</h2>
          <div className="flex items-center">
            <Button
              aria-label="Previous month"
              variant="ghost"
              size="icon"
              onClick={() => setFocus((current) => shiftMonth(current, -1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              aria-label="Next month"
              variant="ghost"
              size="icon"
              onClick={() => setFocus((current) => shiftMonth(current, 1))}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase"
            >
              {label}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="h-9" />;
            const dayEvents = eventsOnDay(cell, events);
            const isToday = sameDay(cell, today);
            const dayClass = cn(
              "mx-auto flex size-8 flex-col items-center justify-center rounded-full text-[12px] font-medium",
              isToday && "bg-primary text-primary-foreground",
              !isToday && dayEvents.length > 0 && "text-foreground",
              !isToday && dayEvents.length === 0 && "text-muted-foreground",
            );
            if (dayEvents.length === 0) {
              return (
                <div
                  key={cell.toISOString()}
                  className="grid h-9 place-items-center"
                >
                  <span className={dayClass}>{cell.getDate()}</span>
                </div>
              );
            }
            const summary = `${cell.getDate()} ${monthLabel(focus)}`;
            return (
              <div
                key={cell.toISOString()}
                className="grid h-9 place-items-center"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${summary}, ${dayEvents
                        .map((event) => `${event.courseCode} ${event.termName}`)
                        .join(", ")}`}
                      className={cn(
                        dayClass,
                        !isToday &&
                          "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      {cell.getDate()}
                      <span
                        className={cn(
                          "mt-px size-1 rounded-full",
                          isToday
                            ? "bg-primary-foreground"
                            : accent[dayEvents[0].accent].dot,
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="flex flex-col gap-0.5">
                    <span className="font-medium">{summary}</span>
                    {dayEvents.map((event) => (
                      <span key={event.courseCode} className="opacity-80">
                        {event.courseCode} · {event.termName}
                      </span>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
        {events.some((event) => event.startsOn && event.endsOn) ? null : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            No dates to show for your selected study periods.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
