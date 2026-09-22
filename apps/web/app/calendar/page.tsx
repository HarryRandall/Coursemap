import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { loadPublishedUniversityCalendar } from "@/lib/coursemap/university-calendar-data";
import type { UniversityCalendarEventRecord } from "@/lib/coursemap/university-calendar";
import { StudyCalendar } from "./study-calendar";

export const dynamic = "force-dynamic";

/** Published key dates across every available calendar year. */
async function loadAllPublishedKeyDates(): Promise<
  UniversityCalendarEventRecord[]
> {
  try {
    const current = await loadPublishedUniversityCalendar();
    const otherYears = current.availableYears.filter(
      (year) => year !== current.year,
    );
    const others = await Promise.all(
      otherYears.map((year) => loadPublishedUniversityCalendar(year)),
    );
    return [current, ...others].flatMap((data) => data.events);
  } catch {
    // Key dates are an enrichment; the plan calendar still works without them.
    return [];
  }
}

export default async function CalendarPage() {
  let catalogue;
  try {
    catalogue = await loadCurrentUserPlanCatalogue();
  } catch {
    return (
      <PlanningCatalogueError pageTitle="Calendar" retryHref="/calendar" />
    );
  }
  const keyDates = await loadAllPublishedKeyDates();
  return <StudyCalendar catalogue={catalogue} keyDates={keyDates} />;
}
