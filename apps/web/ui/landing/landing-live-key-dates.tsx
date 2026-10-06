import { keyDatesAround } from "@/lib/coursemap/university-calendar";
import { loadLandingCalendar } from "@/lib/coursemap/landing-data";
import { LandingKeyDates } from "@/ui/landing/landing-key-dates";

/** The key dates timeline, streamed in once the calendar loads. */
export async function LandingLiveKeyDates({ today }: { today: string }) {
  const events = keyDatesAround(await loadLandingCalendar(today), today);
  return events.length > 0 ? (
    <LandingKeyDates events={events} today={today} />
  ) : (
    <p className="text-sm text-muted-foreground">
      Dates appear here once the university calendar is published.
    </p>
  );
}
