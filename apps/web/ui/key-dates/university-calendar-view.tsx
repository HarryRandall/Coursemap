"use client";
import { badgeVariantForTone } from "@/lib/ui";

import { Badge } from "@coursemap/ui/components/badge";

import { Tabs, TabsContent, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { OutlinedTabsList } from "@/ui/common/outlined-tabs-list";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  PenLine,
  TreePalm,
} from "lucide-react";

import { OptionPicker } from "@/ui/common/option-picker";
import { FilterBar } from "@/ui/common/filter-bar";
import { cn } from "@/lib/cn";
import {
  UNIVERSITY_CALENDAR_CATEGORIES,
  groupUniversityCalendarEventsByMonth,
  type UniversityCalendarEvent,
} from "@/lib/coursemap/university-calendar";

const categoryIcons = {
  teaching: BookOpen,
  examinations: PenLine,
  enrolment: ClipboardCheck,
  graduation: GraduationCap,
  holiday: TreePalm,
  campus: MapPin,
};
function CategoryBadge({ event }: { event: UniversityCalendarEvent }) {
  const Icon = categoryIcons[event.category];
  return (
    <Badge variant={badgeVariantForTone[tones[event.category]]}>
      <Icon size={12} aria-hidden="true" />
      {categoryLabel(event)}
    </Badge>
  );
}
const tones = {
  teaching: "brand",
  examinations: "danger",
  enrolment: "warning",
  graduation: "success",
  holiday: "info",
  campus: "neutral",
} as const;
function categoryLabel(event: UniversityCalendarEvent) {
  return UNIVERSITY_CALENDAR_CATEGORIES.find(
    (item) => item.value === event.category,
  )?.label;
}
function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
function Countdown({ date, today }: { date: string; today: string }) {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return (
    <span>
      {days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : days > 0
            ? `In ${days} days`
            : `${Math.abs(days)} days ago`}
    </span>
  );
}
function EventRows({
  events,
  todayIso,
}: {
  events: UniversityCalendarEvent[];
  todayIso: string;
}) {
  return (
    <ol className="divide-y divide-border/60">
      {events.map((event) => (
        <li
          key={event.id}
          className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 px-4 py-5 sm:px-6 md:grid-cols-[5rem_minmax(0,1fr)_auto]"
        >
          <time
            dateTime={event.date}
            className="flex flex-col text-muted-foreground"
          >
            <span className="text-xs">
              {dateLabel(event.date, { weekday: "short" })}
            </span>
            <span
              className={cn(
                "text-2xl font-semibold tracking-tight text-foreground tabular-nums",
                event.date === todayIso && "text-primary",
              )}
            >
              {event.date.slice(8)}
            </span>
          </time>
          <div>
            <p className="text-sm leading-relaxed font-medium text-foreground">
              {event.title}
            </p>
            <div className="mt-1 text-xs text-muted-foreground md:hidden">
              <CategoryBadge event={event} />
            </div>
            {event.date === todayIso && (
              <span className="text-xs font-medium text-primary">Today</span>
            )}
          </div>
          <div className="hidden justify-self-end md:block">
            <CategoryBadge event={event} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function UniversityCalendarView({
  allEvents,
  availableYears,
  todayIso,
  year,
}: {
  allEvents: UniversityCalendarEvent[];
  availableYears: number[];
  todayIso: string;
  year: number;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const defaultPeriod =
    year < Number(todayIso.slice(0, 4)) ? "past" : "upcoming";
  const rawPeriod = params.get("period");
  const period =
    rawPeriod === "past" || rawPeriod === "all" || rawPeriod === "upcoming"
      ? rawPeriod
      : defaultPeriod;
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const category = params.get("category") ?? "";
  const events = allEvents.filter(
    (event) =>
      (!category || event.category === category) &&
      event.title.toLowerCase().includes(query),
  );
  const futureEvents = events.filter((event) => event.date >= todayIso);
  const pastEvents = events.filter((event) => event.date < todayIso);
  const visibleEvents =
    period === "past"
      ? pastEvents
      : period === "upcoming"
        ? futureEvents
        : events;
  const months = groupUniversityCalendarEventsByMonth(visibleEvents);
  if (period === "past") months.reverse();
  const upcoming = futureEvents.slice(0, 3);
  function href(nextPeriod: string, nextYear = year) {
    const next = new URLSearchParams(params.toString());
    next.delete("view");
    const currentYear = Number(todayIso.slice(0, 4));
    const defaultYear = availableYears.includes(currentYear)
      ? currentYear
      : Math.max(...availableYears);
    const nextDefaultPeriod = nextYear < currentYear ? "past" : "upcoming";
    if (nextPeriod === nextDefaultPeriod) next.delete("period");
    else next.set("period", nextPeriod);
    if (nextYear === defaultYear) next.delete("year");
    else next.set("year", String(nextYear));
    const search = next.toString();
    return search ? `/key-dates?${search}` : "/key-dates";
  }

  return (
    <div className="workspace-scroll w-full space-y-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          University calendar
        </h2>
        <OptionPicker
          aria-label="Calendar year"
          className="w-24"
          searchable={false}
          items={availableYears.map((value) => ({
            value: String(value),
            label: String(value),
          }))}
          value={String(year)}
          onValueChange={(value) => {
            const nextYear = Number(value);
            router.push(
              href(
                nextYear < Number(todayIso.slice(0, 4)) ? "past" : "upcoming",
                nextYear,
              ),
              { scroll: false },
            );
          }}
        />
      </div>

      {!query && !category && upcoming.length > 0 && (
        <section aria-label="Next key dates" className="shrink-0 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {upcoming.map((event, index) => (
              <article
                key={event.id}
                className={cn(
                  "rounded-xl border p-4",
                  index === 0
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CategoryBadge event={event} />
                  <span className="text-xs text-muted-foreground">
                    <Countdown date={event.date} today={todayIso} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <time
                    dateTime={event.date}
                    className="text-xl font-semibold tracking-tight"
                  >
                    {dateLabel(event.date, { day: "numeric", month: "short" })}
                  </time>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(event.date, { weekday: "short" })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed font-medium">
                  {event.title}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <FilterBar
        searchPlaceholder="Search dates, deadlines and events..."
        filters={[
          {
            key: "category",
            label: "Category",
            allLabel: "All categories",
            options: UNIVERSITY_CALENDAR_CATEGORIES,
          },
        ]}
      />

      <Tabs
        value={period}
        onValueChange={(value) => router.push(href(value), { scroll: false })}
        className="gap-4"
      >
        <OutlinedTabsList aria-label="Date period">
          {(
            [
              ["upcoming", "Upcoming", futureEvents.length],
              ["past", "Past dates", pastEvents.length],
              ["all", "All dates", events.length],
            ] as const
          ).map(([value, label, count]) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              {label}
              <Badge
                variant={period === value ? "primary-light" : "outline"}
                className={cn(
                  "tabular-nums",
                  period !== value && "text-muted-foreground",
                )}
              >
                {count}
              </Badge>
            </TabsTrigger>
          ))}
        </OutlinedTabsList>
        <TabsContent
          key={`${year}-${period}-${category}-${query}`}
          value={period}
          className="mt-0 space-y-4"
          aria-label="Key dates"
          tabIndex={0}
        >
          {months.length === 0 && (
            <p
              role="status"
              className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground"
            >
              {period === "upcoming"
                ? `No upcoming dates match in ${year}. Select Past dates or All dates to browse earlier events.`
                : `No ${period === "past" ? "past " : ""}dates match in ${year}. Try another search or category.`}
            </p>
          )}
          {months.map((item) => (
            <section
              key={item.key}
              aria-labelledby={`month-heading-${item.key}`}
              className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4 lg:flex-col lg:items-start lg:justify-start lg:gap-2 lg:border-r lg:border-b-0 lg:py-6">
                <h3
                  id={`month-heading-${item.key}`}
                  className="text-sm font-semibold"
                >
                  {item.label}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {item.events.length}{" "}
                  {item.events.length === 1 ? "date" : "dates"}
                </span>
              </div>
              <EventRows
                events={
                  period === "past" ? [...item.events].reverse() : item.events
                }
                todayIso={todayIso}
              />
            </section>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
