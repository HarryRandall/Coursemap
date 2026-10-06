import { LandingCampus } from "@/ui/landing/landing-campus";
import { LandingFeatureGrid } from "@/ui/landing/landing-feature-grid";
import { LandingFooter } from "@/ui/landing/landing-footer";
import { LandingHeader } from "@/ui/landing/landing-header";
import { LandingHelp } from "@/ui/landing/landing-help";
import { LandingHero } from "@/ui/landing/landing-hero";
import { LandingKeyDates } from "@/ui/landing/landing-key-dates";
import { LandingPlanner } from "@/ui/landing/landing-planner";
import { LandingRequirements } from "@/ui/landing/landing-requirements";
import {
  LandingSocieties,
  type LandingSocietyRow,
} from "@/ui/landing/landing-societies";
import { loadSocieties } from "@/lib/societies-data";
import { formatEventDate, upcomingSocietyEvents } from "@/lib/society-events";
import { getAuthViewer } from "@/lib/auth/viewer";
import {
  decorateUniversityCalendarEvents,
  keyDatesAround,
  upcomingUniversityCalendarEvents,
  type UniversityCalendarEvent,
} from "@/lib/coursemap/university-calendar";
import { loadPublishedUniversityCalendar } from "@/lib/coursemap/university-calendar-data";
import { loadLandingCourses } from "@/lib/coursemap/landing-courses";
import { redirect } from "next/navigation";

/** Today in Canberra as an ISO day, the calendar's own time zone. */
function canberraToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(new Date());
}

/**
 * Published key dates for this year and next, so December still has
 * something coming; none when the calendar cannot load.
 */
async function landingCalendar(today: string) {
  const year = Number(today.slice(0, 4));
  try {
    const calendars = await Promise.all([
      loadPublishedUniversityCalendar(year),
      loadPublishedUniversityCalendar(year + 1),
    ]);
    return decorateUniversityCalendarEvents(
      calendars.flatMap((calendar) => calendar.events),
    );
  } catch {
    return [] as UniversityCalendarEvent[];
  }
}

const SOCIETY_ROWS = 3;

/**
 * Three societies for the landing page, logos first: those with an upcoming
 * event show it, and the rest fill in with their summary. None when the
 * directory cannot load.
 */
async function landingSocieties(): Promise<LandingSocietyRow[]> {
  try {
    const { societies, events } = await loadSocieties();
    const withLogo = (slug: string) =>
      Boolean(societies.find((society) => society.slug === slug)?.logoUrl);
    const rows: LandingSocietyRow[] = [];
    const used = new Set<string>();
    const now = new Date();
    // Only events still to start, so a running course never shows a past date.
    const upcoming = upcomingSocietyEvents(events, now)
      .filter((event) => new Date(event.startsAt) > now)
      .sort(
        (left, right) =>
          Number(withLogo(right.societySlug)) -
          Number(withLogo(left.societySlug)),
      );
    for (const event of upcoming) {
      const society = societies.find((item) => item.slug === event.societySlug);
      if (!society || used.has(society.slug)) continue;
      used.add(society.slug);
      rows.push({
        society,
        detail: `${event.title} · ${formatEventDate(event.startsAt)}`,
      });
    }
    const rest = [...societies].sort(
      (left, right) =>
        Number(Boolean(right.logoUrl)) - Number(Boolean(left.logoUrl)),
    );
    for (const society of rest) {
      if (rows.length >= SOCIETY_ROWS) break;
      if (used.has(society.slug)) continue;
      used.add(society.slug);
      rows.push({ society, detail: society.summary });
    }
    return rows.slice(0, SOCIETY_ROWS);
  } catch {
    return [];
  }
}

export default async function Home() {
  // Signed-in students go straight to the app; onboarding is offered from the
  // dashboard empty state rather than forced here.
  if (await getAuthViewer()) {
    redirect("/dashboard");
  }
  const today = canberraToday();
  const [calendar, courses, societies] = await Promise.all([
    landingCalendar(today),
    loadLandingCourses(Number(today.slice(0, 4))).catch(() => []),
    landingSocieties(),
  ]);
  const keyDates = keyDatesAround(calendar, today);

  return (
    <main className="min-h-dvh bg-background">
      <LandingHeader />
      <LandingHero
        keyDates={upcomingUniversityCalendarEvents(calendar, today, 3)}
        today={today}
      />
      <LandingRequirements courses={courses} />
      <LandingPlanner />
      <LandingFeatureGrid />
      <LandingCampus
        societies={
          societies.length > 0 ? <LandingSocieties rows={societies} /> : null
        }
        keyDates={
          keyDates.length > 0 ? (
            <LandingKeyDates events={keyDates} today={today} />
          ) : null
        }
      />
      <LandingFooter />
      <LandingHelp />
    </main>
  );
}

export const dynamic = "force-dynamic";
