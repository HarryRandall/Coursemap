import type { Term } from "@/lib/coursemap/types";

export const STANDARD_ACADEMIC_PERIODS = [
  { code: "SUMMER", name: "Summer Session", shortName: "Summer", sortOrder: 5 },
  { code: "S1", name: "First Semester", shortName: "S1", sortOrder: 10 },
  {
    code: "AUTUMN",
    name: "Autumn Session",
    shortName: "Autumn",
    sortOrder: 15,
  },
  {
    code: "WINTER",
    name: "Winter Session",
    shortName: "Winter",
    sortOrder: 20,
  },
  { code: "S2", name: "Second Semester", shortName: "S2", sortOrder: 30 },
  {
    code: "SPRING",
    name: "Spring Session",
    shortName: "Spring",
    sortOrder: 35,
  },
] as const;

/** First or Second Semester, the two terms a standard study load is built on. */
export function isSemesterTerm(term: Pick<Term, "id">) {
  return /^S[12]$/u.test(term.id.split("-").at(-1)?.toUpperCase() ?? "");
}

/**
 * A course session as the planner prints it: "S1" for First Semester and
 * "Summer" for Summer Session. Names outside the standard periods keep their
 * first word.
 */
export function sessionShortName(session: string) {
  const period = STANDARD_ACADEMIC_PERIODS.find(
    (item) =>
      item.name.toLowerCase() === session.toLowerCase() ||
      item.shortName.toLowerCase() === session.toLowerCase(),
  );
  if (period) return period.shortName;
  if (/semester 1\b/iu.test(session)) return "S1";
  if (/semester 2\b/iu.test(session)) return "S2";
  return session.split(" ")[0];
}

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function academicPeriodDates(
  startsOn: string | null,
  endsOn: string | null,
) {
  if (!startsOn || !endsOn) return "Calendar dates pending";
  return `${dateFormat.format(new Date(startsOn))} to ${dateFormat.format(new Date(endsOn))}`;
}

export function academicPeriodTerm(period: {
  calendar_year: number;
  code: string;
  name: string;
  short_name: string;
  starts_on: string | null;
  ends_on: string | null;
  sort_order: number;
}): Term {
  return {
    id: `${period.calendar_year}-${period.code.toLowerCase()}`,
    year: period.calendar_year,
    name: period.name,
    shortName: period.short_name,
    dates: academicPeriodDates(period.starts_on, period.ends_on),
    startsOn: period.starts_on ?? undefined,
    endsOn: period.ends_on ?? undefined,
    sortOrder: period.sort_order,
  };
}
