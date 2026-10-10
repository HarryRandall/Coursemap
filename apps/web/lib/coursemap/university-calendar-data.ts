import "server-only";
import { ACADEMIC_TIME_ZONE } from "@/lib/canberra-format";
import type { UniversityCalendarEventRecord } from "@/lib/coursemap/university-calendar";
import { createPublicClient } from "@/lib/supabase/public-server";

export type UniversityCalendarData = {
  year: number | null;
  availableYears: number[];
  events: UniversityCalendarEventRecord[];
};

function emptyData(requestedYear?: number): UniversityCalendarData {
  return { year: requestedYear ?? null, availableYears: [], events: [] };
}

function currentCanberraYear() {
  return Number.parseInt(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ACADEMIC_TIME_ZONE,
      year: "numeric",
    }).format(new Date()),
    10,
  );
}

/**
 * Load the published university calendar for one year.
 *
 * Reads use the cookie-free public client because published key dates are
 * public catalogue data. Without an explicit year the current Canberra year
 * is served when it has published events, otherwise the latest year that has.
 */
export async function loadPublishedUniversityCalendar(
  requestedYear?: number,
): Promise<UniversityCalendarData> {
  const client = createPublicClient();
  const { data: yearRows, error: yearsError } = await client
    .from("university_calendar_events")
    .select("calendar_year")
    .eq("status", "published")
    .order("calendar_year", { ascending: false });
  if (yearsError) {
    throw new Error("The university calendar years could not be loaded.");
  }

  const availableYears = [
    ...new Set((yearRows ?? []).map((row) => row.calendar_year)),
  ];
  if (availableYears.length === 0) return emptyData(requestedYear);

  const fallbackYear = availableYears.includes(currentCanberraYear())
    ? currentCanberraYear()
    : availableYears[0];
  const year = requestedYear ?? fallbackYear;
  if (!availableYears.includes(year)) {
    return { year, availableYears, events: [] };
  }

  const { data: eventRows, error: eventsError } = await client
    .from("university_calendar_events")
    .select("id,event_date,title")
    .eq("status", "published")
    .eq("calendar_year", year)
    .order("event_date", { ascending: true })
    .order("title", { ascending: true });
  if (eventsError) {
    throw new Error("The university calendar events could not be loaded.");
  }

  return {
    year,
    availableYears,
    events: (eventRows ?? []).map((row) => ({
      id: row.id,
      date: row.event_date,
      title: row.title,
    })),
  };
}
