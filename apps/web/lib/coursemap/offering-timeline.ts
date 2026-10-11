import { STANDARD_ACADEMIC_PERIODS } from "@/lib/coursemap/academic-periods";
import type { CourseOffering } from "@/lib/coursemap/course-types";

/**
 * Where an offering stands on a given day. Dates are compared as Canberra
 * calendar days (YYYY-MM-DD), so the server and the browser agree.
 */
export type OfferingPhase =
  | "upcoming"
  | "closing"
  | "enrolment-closed"
  | "running"
  | "finished"
  | "unknown";

export type OfferingStanding = { phase: OfferingPhase; label: string | null };

/** Enrolment closing within this many days is called out. */
const CLOSING_SOON_DAYS = 14;

const DAY_MS = 86_400_000;

function dayNumber(isoDate: string) {
  return Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((dayNumber(toIso) - dayNumber(fromIso)) / DAY_MS);
}

const SHORT_DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "2 Mar", reading the stored day as written. */
export function shortDate(isoDate: string) {
  return SHORT_DATE.format(new Date(dayNumber(isoDate)));
}

function closesIn(days: number) {
  if (days === 0) return "Enrolment closes today";
  if (days === 1) return "Enrolment closes tomorrow";
  return `Enrolment closes in ${days} days`;
}

/** A few words on where an offering stands today, or null when undated. */
export function offeringStanding(
  offering: Pick<CourseOffering, "startsOn" | "endsOn" | "enrolClosesOn">,
  today: string,
): OfferingStanding {
  const startsOn = day(offering.startsOn);
  const endsOn = day(offering.endsOn);
  const enrolClosesOn = day(offering.enrolClosesOn);
  if (endsOn && today > endsOn) return { phase: "finished", label: "Finished" };
  if (startsOn && today >= startsOn) {
    return {
      phase: "running",
      label:
        enrolClosesOn && today <= enrolClosesOn
          ? `Running · enrol by ${shortDate(enrolClosesOn)}`
          : "Running now",
    };
  }
  if (enrolClosesOn) {
    const days = daysBetween(today, enrolClosesOn);
    if (days < 0)
      return { phase: "enrolment-closed", label: "Enrolment closed" };
    if (days <= CLOSING_SOON_DAYS)
      return { phase: "closing", label: closesIn(days) };
  }
  if (startsOn) {
    return { phase: "upcoming", label: `Starts ${shortDate(startsOn)}` };
  }
  return { phase: "unknown", label: null };
}

export type OfferingMilestone = {
  key: "starts" | "enrol" | "census" | "ends";
  label: string;
  date: string;
  passed: boolean;
};

/** The dates a student plans around, in calendar order. */
export function offeringMilestones(
  offering: Pick<
    CourseOffering,
    "startsOn" | "endsOn" | "enrolClosesOn" | "censusOn"
  >,
  today: string,
): OfferingMilestone[] {
  const entries: Array<[OfferingMilestone["key"], string, string | null]> = [
    ["starts", "Starts", day(offering.startsOn)],
    ["enrol", "Last day to enrol", day(offering.enrolClosesOn)],
    ["census", "Census", day(offering.censusOn)],
    ["ends", "Ends", day(offering.endsOn)],
  ];
  return entries
    .flatMap(([key, label, date]) =>
      date ? [{ key, label, date, passed: date < today }] : [],
    )
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * How far through the year an offering runs, as fractions of the year for a
 * strip of months. An end before the start, or dates outside the year, are
 * clipped rather than drawn backwards.
 */
export function offeringSpan(
  offering: Pick<CourseOffering, "startsOn" | "endsOn">,
  year: number,
) {
  const startsOn = day(offering.startsOn);
  const endsOn = day(offering.endsOn);
  if (!startsOn || !endsOn) return null;
  const yearStart = `${year}-01-01`;
  const length = daysBetween(yearStart, `${year + 1}-01-01`);
  const clip = (value: number) => Math.min(1, Math.max(0, value / length));
  const start = clip(daysBetween(yearStart, startsOn));
  const end = clip(daysBetween(yearStart, endsOn) + 1);
  return end > start ? { start, end } : null;
}

/** Today's place on the same strip, or null outside the year. */
export function yearFraction(today: string, year: number) {
  if (!today.startsWith(`${year}-`)) return null;
  const yearStart = `${year}-01-01`;
  return (
    daysBetween(yearStart, today) / daysBetween(yearStart, `${year + 1}-01-01`)
  );
}

/**
 * The planner term an offering lands in, such as "2026-s1", when its period
 * is one the planner has a lane for.
 */
export function offeringTermId(
  offering: Pick<CourseOffering, "calendarYear" | "periodCode">,
) {
  const code = offering.periodCode.toUpperCase();
  return STANDARD_ACADEMIC_PERIODS.some((period) => period.code === code)
    ? `${offering.calendarYear}-${code.toLowerCase()}`
    : null;
}

/** The planner's short name for an offering's period: "S1", "Spring". */
export function offeringShortName(
  offering: Pick<CourseOffering, "periodCode" | "periodName">,
) {
  const code = offering.periodCode.toUpperCase();
  return (
    STANDARD_ACADEMIC_PERIODS.find((period) => period.code === code)
      ?.shortName ?? offering.periodName
  );
}
