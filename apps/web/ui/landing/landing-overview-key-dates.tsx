import { upcomingUniversityCalendarEvents } from "@/lib/coursemap/university-calendar";
import { loadLandingCalendar } from "@/lib/coursemap/landing-data";
import { KeyDatesMetric } from "@/ui/dashboard/key-dates-metric";

/** The dashboard's key dates card with the next three live dates. */
export async function LandingOverviewKeyDates({ today }: { today: string }) {
  const events = upcomingUniversityCalendarEvents(
    await loadLandingCalendar(today),
    today,
    3,
  );
  return <KeyDatesMetric events={events} todayIso={today} />;
}
