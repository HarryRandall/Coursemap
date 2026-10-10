"use client";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";

import { useRouter, useSearchParams } from "next/navigation";
import type { SocietyEvent } from "@/lib/society-events";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";
import {
  toZoned,
  zonedStartOfDay,
} from "@coursemap/ui/components/event-calendar/event-calendar-lib";
import { EventCalendar } from "@coursemap/ui/components/event-calendar/event-calendar";
import { EventCalendarContent } from "@coursemap/ui/components/event-calendar/event-calendar-content";
import {
  EventCalendarNav,
  EventCalendarNavToday,
  EventCalendarNavPrev,
  EventCalendarNavNext,
  EventCalendarTitle,
  EventCalendarViewSwitcher,
} from "@coursemap/ui/components/event-calendar/event-calendar-nav";
import type { CalendarEvent } from "@coursemap/ui/components/event-calendar/event-calendar-types";
import { useCoursemap } from "@/app/providers";
import { AppShell } from "@/ui/shell";

import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import {
  decorateUniversityCalendarEvents,
  type UniversityCalendarCategory,
  type UniversityCalendarEventRecord,
} from "@/lib/coursemap/university-calendar";
import { studyPeriodMarkers } from "@/lib/coursemap/study-period-markers";
import { CalendarFilters } from "@/ui/key-dates/calendar-filters";

const CATEGORY_COLORS: Record<UniversityCalendarCategory, string> = {
  teaching: "var(--primary)",
  examinations: "var(--destructive)",
  enrolment: "var(--warning)",
  graduation: "var(--success)",
  holiday: "var(--info)",
  campus: "var(--muted-foreground)",
};

const PLAN_TERM_FILTER = "plan-terms" as const;

/** Canberra midnight for an ISO day, independent of the browser time zone. */
function localMidnight(isoDay: string) {
  return zonedStartOfDay(new Date(`${isoDay}T12:00:00Z`), "Australia/Sydney");
}

function addDays(date: Date, days: number) {
  const next = toZoned(date, "Australia/Sydney");
  next.setDate(next.getDate() + days);
  return next;
}

export function StudyCalendar({
  catalogue,
  keyDates,
  societyEvents,
  societiesUnavailable = false,
}: {
  catalogue: PlanCatalogue;
  keyDates: UniversityCalendarEventRecord[];
  societyEvents: SocietyEvent[];
  societiesUnavailable?: boolean;
}) {
  const router = useRouter();
  const { state } = useCoursemap();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const includeSocieties = params.get("societies") === "1";

  const degree = catalogue.degrees.find(
    (item) => item.code === state.profile.degreeCode,
  );
  const timelineTerms = useMemo(() => {
    const years = planTimelineYears({
      degree,
      commencementYear: state.profile.commencementYear,
      extensionYears: state.profile.extensionYears,
    });
    return planTimelineTerms({ terms: catalogue.terms, years });
  }, [
    catalogue.terms,
    degree,
    state.profile.commencementYear,
    state.profile.extensionYears,
  ]);

  const courseCountByTerm = useMemo(() => {
    const counts = new Map<string, number>();
    state.attempts.forEach((attempt) => {
      counts.set(attempt.termId, (counts.get(attempt.termId) ?? 0) + 1);
    });
    return counts;
  }, [state.attempts]);

  const events = useMemo<CalendarEvent[]>(() => {
    const termEvents: CalendarEvent[] =
      category && category !== PLAN_TERM_FILTER
        ? []
        : studyPeriodMarkers(timelineTerms, courseCountByTerm).map((marker) => {
            const start = localMidnight(marker.date);
            return {
              id: marker.id,
              title: marker.title,
              start,
              end: addDays(start, 1),
              allDay: true,
              readOnly: true,
              color: "var(--primary)",
              priority: 10,
            };
          });

    const keyDateEvents: CalendarEvent[] = decorateUniversityCalendarEvents(
      keyDates,
    )
      .filter((event) => !category || event.category === category)
      .map((event) => {
        const start = localMidnight(event.date);
        return {
          id: `key-date-${event.id}`,
          title: event.title,
          start,
          end: addDays(start, 1),
          allDay: true,
          readOnly: true,
          color: CATEGORY_COLORS[event.category],
        };
      });

    const clubEvents: CalendarEvent[] =
      !includeSocieties || (category && category !== "societies")
        ? []
        : societyEvents.map((event) => ({
            id: `society-event-${event.id}`,
            title: `${event.title} · ${event.host}`,
            start: new Date(event.startsAt),
            end: new Date(event.endsAt),
            allDay: false,
            readOnly: true,
            color: "var(--primary)",
          }));
    return [...termEvents, ...keyDateEvents, ...clubEvents];
  }, [
    courseCountByTerm,
    category,
    includeSocieties,
    keyDates,
    timelineTerms,
    societyEvents,
  ]);

  return (
    <AppShell fill>
      <div className="workspace-stack">
        <h1 className="sr-only">Study calendar</h1>

        {includeSocieties && societiesUnavailable && (
          <Alert variant="warning">
            <AlertDescription>
              Society events could not be loaded. Please try again shortly.
            </AlertDescription>
          </Alert>
        )}
        {keyDates.length === 0 ? (
          <Alert variant={"default"}>
            <CalendarDays aria-hidden="true" />
            <AlertDescription>
              No published ANU key dates are available yet, so the calendar
              shows your plan&apos;s study periods. You can also turn on society
              events in the filters.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs md:flex-1">
          <EventCalendar
            events={events}
            onEventClick={({ event }) => {
              if (event.id.startsWith("society-event-"))
                router.push(
                  `/societies/events/${event.id.slice("society-event-".length)}`,
                );
            }}
            timeZone="Australia/Sydney"
            defaultView="month"
            views={["month", "agenda"]}
            interactions={{ drag: false, resize: false, selectSlot: false }}
            eventTooltip
            agendaDayCount={60}
            className="h-[32rem] md:h-full md:min-h-0 md:flex-1"
            classNames={{ nav: "border-b border-border px-3 py-2" }}
          >
            <EventCalendarNav className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-1">
                <EventCalendarNavToday />
                <EventCalendarNavPrev />
                <EventCalendarNavNext />
              </div>
              <EventCalendarTitle className="col-span-2 row-start-2 text-center sm:col-span-1 sm:row-auto" />
              <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-3">
                <EventCalendarViewSwitcher />
                <CalendarFilters includePlanTerms hideSearch />
              </div>
            </EventCalendarNav>
            <EventCalendarContent />
          </EventCalendar>
        </div>
      </div>
    </AppShell>
  );
}
