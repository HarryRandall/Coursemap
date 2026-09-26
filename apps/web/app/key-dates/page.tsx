import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Button, buttonVariants } from "@coursemap/ui/primitives/button";
import { Card } from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import ReuiLink from "next/link";
import { CircleAlert, ExternalLink, RefreshCw } from "lucide-react";
import { CalendarIllustration } from "@/ui/key-dates/calendar-illustration";
import { CategoryBadge } from "@/ui/key-dates/category-badge";
import { UniversityCalendarView } from "@/ui/key-dates/university-calendar-view";
import { AppShell } from "@/ui/shell/app-shell";

import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { decorateUniversityCalendarEvents } from "@/lib/coursemap/university-calendar";
import {
  loadPublishedUniversityCalendar,
  type UniversityCalendarData,
} from "@/lib/coursemap/university-calendar-data";

export const dynamic = "force-dynamic";

const ANU_CALENDAR_URL =
  "https://www.anu.edu.au/directories/university-calendar";

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** The kinds of dates students can expect, in the colours the list uses. */
const EXPECTED_CATEGORIES = [
  "teaching",
  "enrolment",
  "examinations",
  "holiday",
] as const;

function EmptyCalendarCard({
  availableYears,
  canManage,
  year,
}: {
  availableYears: number[];
  canManage: boolean;
  year: number;
}) {
  const latestYear = availableYears[0];
  return (
    <Card className="relative min-h-96 flex-1 py-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-linear-to-b from-primary/8 to-transparent"
      />
      <Empty className="relative flex-1 py-14 sm:py-20">
        <EmptyHeader className="relative max-w-lg">
          <EmptyMedia>
            <CalendarIllustration />
          </EmptyMedia>
          <EmptyTitle className="text-lg">
            {latestYear
              ? `The ${year} calendar isn't published yet`
              : "Key dates are on their way"}
          </EmptyTitle>
          <EmptyDescription>
            {latestYear
              ? `Dates for ${year} appear here once the official ANU calendar is published. The ${latestYear} calendar is available now.`
              : "Once the official ANU calendar is published, this is where you'll find every deadline that shapes your semester."}
          </EmptyDescription>
        </EmptyHeader>
        <ul
          aria-label="Dates you'll find here"
          className="relative flex flex-wrap justify-center gap-2"
        >
          {EXPECTED_CATEGORIES.map((category) => (
            <li key={category}>
              <CategoryBadge category={category} />
            </li>
          ))}
        </ul>
        <EmptyContent className="relative">
          <div className="flex flex-wrap justify-center gap-2">
            {latestYear ? (
              <Button asChild size="sm">
                <ReuiLink href={`/key-dates?year=${latestYear}`}>
                  View {latestYear} dates
                </ReuiLink>
              </Button>
            ) : canManage ? (
              <Button asChild size="sm">
                <ReuiLink href={`/admin/key-dates/${year}`}>
                  <RefreshCw size={14} aria-hidden="true" />
                  Sync key dates
                </ReuiLink>
              </Button>
            ) : null}
            <a
              href={ANU_CALENDAR_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View the ANU calendar
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </EmptyContent>
      </Empty>
    </Card>
  );
}

function CalendarLoadError({ retryHref }: { retryHref: string }) {
  return (
    <Card className="mx-auto max-w-xl p-4 sm:p-5">
      <Alert role="alert" variant={"warning"}>
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Key dates temporarily unavailable</AlertTitle>
        <AlertDescription>
          The published calendar could not be loaded. Please try again shortly.
        </AlertDescription>
      </Alert>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="default">
          <ReuiLink href={retryHref}>Try again</ReuiLink>
        </Button>
        <a
          href={ANU_CALENDAR_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          View the ANU calendar
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </Card>
  );
}

export default async function KeyDatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawYear = firstParam(params.year);
  const requestedYear = /^\d{4}$/.test(rawYear) ? Number(rawYear) : undefined;

  let data: UniversityCalendarData = {
    year: requestedYear ?? null,
    availableYears: [],
    events: [],
  };
  let calendarUnavailable = false;
  try {
    data = await loadPublishedUniversityCalendar(requestedYear);
  } catch {
    calendarUnavailable = true;
  }

  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const allEvents = decorateUniversityCalendarEvents(data.events);
  // Only an empty calendar offers the admin shortcut, so only then is the
  // permission worth a round trip.
  const canSync =
    !calendarUnavailable &&
    data.availableYears.length === 0 &&
    (await canManageCatalogueOperations());
  const retryHref = requestedYear
    ? `/key-dates?year=${requestedYear}`
    : "/key-dates";

  return (
    <AppShell fill>
      <div className="workspace-stack w-full">
        <h1 className="sr-only">Key dates</h1>

        {calendarUnavailable ? (
          <CalendarLoadError retryHref={retryHref} />
        ) : allEvents.length === 0 || data.year === null ? (
          <div className="workspace-scroll flex w-full flex-col">
            <EmptyCalendarCard
              availableYears={data.availableYears}
              canManage={canSync}
              year={data.year ?? Number(todayIso.slice(0, 4))}
            />
          </div>
        ) : (
          <UniversityCalendarView
            key={data.year}
            allEvents={allEvents}
            availableYears={data.availableYears}
            todayIso={todayIso}
            year={data.year}
          />
        )}
      </div>
    </AppShell>
  );
}
