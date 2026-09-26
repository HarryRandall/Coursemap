import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import {
  decorateUniversityCalendarEvents,
  upcomingUniversityCalendarEvents,
} from "@/lib/coursemap/university-calendar";
import { loadPublishedUniversityCalendar } from "@/lib/coursemap/university-calendar-data";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

const KEY_DATES_SHOWN = 3;

/**
 * The next few published key dates from today in Canberra. Next year's
 * calendar is included so late-year dashboards still look ahead. A calendar
 * that cannot load leaves the card empty rather than failing the page.
 */
async function upcomingKeyDates(todayIso: string) {
  const year = Number(todayIso.slice(0, 4));
  try {
    const calendars = await Promise.all([
      loadPublishedUniversityCalendar(year),
      loadPublishedUniversityCalendar(year + 1),
    ]);
    return upcomingUniversityCalendarEvents(
      decorateUniversityCalendarEvents(
        calendars.flatMap((calendar) => calendar.events),
      ),
      todayIso,
      KEY_DATES_SHOWN,
    );
  } catch {
    return [];
  }
}

/**
 * Student home. Students without a primary plan see the dashboard empty state,
 * which offers onboarding, rather than being redirected into it.
 */
export default async function DashboardPage() {
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(new Date());
  let data;
  try {
    const [catalogue, choices, keyDates] = await Promise.all([
      loadCurrentUserPlanCatalogue(),
      loadOnboardingCatalogue(),
      upcomingKeyDates(todayIso),
    ]);
    data = { catalogue, choices, keyDates, todayIso };
  } catch {
    return (
      <PlanningCatalogueError pageTitle="Dashboard" retryHref="/dashboard" />
    );
  }
  return <Dashboard {...data} />;
}
