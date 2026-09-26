import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { UniversityCalendarEvent } from "@/lib/coursemap/university-calendar";
import { UNIVERSITY_CALENDAR_CATEGORIES } from "@/lib/coursemap/university-calendar";
import {
  calendarDateLabel,
  categoryIcons,
} from "@/ui/key-dates/category-badge";
import { AcademicMetricCard } from "./academic-metric-card";
import { keyDatesSkeleton } from "./metric-skeletons";

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Tomorrow", "In 5 days" or "In 3 weeks" from an ISO day. */
function countdown(date: string, todayIso: string) {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) /
      DAY,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}

/** The next few university key dates, each with its category icon. */
export function KeyDatesMetric({
  events,
  todayIso,
}: {
  events: readonly UniversityCalendarEvent[];
  todayIso: string;
}) {
  return (
    <AcademicMetricCard
      empty={
        events.length === 0
          ? { label: "None coming up", skeleton: keyDatesSkeleton }
          : null
      }
      header={
        <>
          <h3 className="text-sm font-semibold">Key dates</h3>
          <Link
            href="/key-dates"
            className="-my-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            All dates
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </>
      }
    >
      <ul className="flex h-24 flex-col justify-center gap-2">
        {events.map((event) => {
          const Icon = categoryIcons[event.category];
          const category = UNIVERSITY_CALENDAR_CATEGORIES.find(
            (item) => item.value === event.category,
          )?.label;
          return (
            <li key={event.id} className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
                role="img"
                aria-label={category}
              >
                <Icon size={13} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {event.title}
                </span>
              </span>
              <span className="shrink-0 text-right leading-tight">
                <span className="block text-xs font-medium tabular-nums">
                  {calendarDateLabel(event.date, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {countdown(event.date, todayIso)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </AcademicMetricCard>
  );
}
