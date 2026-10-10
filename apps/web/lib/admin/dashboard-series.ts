import { ACADEMIC_TIME_ZONE } from "@/lib/canberra-format";
// Dashboard buckets follow the Canberra calendar so "today" and "this week"
// match what an operator in Australia sees, not the server's UTC day.
const CANBERRA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 86_400_000;

/** The Canberra calendar day of an instant, as YYYY-MM-DD. */
export function canberraDay(value: Date | string) {
  return CANBERRA_DAY.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The Monday that starts the week containing a YYYY-MM-DD day. */
export function weekStart(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

/** `count` consecutive days ending with the day containing `now`, oldest first. */
export function recentDays(now: Date, count: number) {
  const today = canberraDay(now);
  return Array.from({ length: count }, (_, index) =>
    shiftDay(today, index - count + 1),
  );
}

/** `count` consecutive week starts ending with the current week, oldest first. */
export function recentWeeks(now: Date, count: number) {
  const current = weekStart(canberraDay(now));
  return Array.from({ length: count }, (_, index) =>
    shiftDay(current, (index - count + 1) * 7),
  );
}

/** Counts timestamps per bucket. Timestamps outside the buckets are ignored. */
export function countByDay(
  timestamps: readonly string[],
  days: readonly string[],
) {
  const counts = new Map(days.map((day) => [day, 0]));
  for (const timestamp of timestamps) {
    const day = canberraDay(timestamp);
    const current = counts.get(day);
    if (current !== undefined) counts.set(day, current + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

/**
 * Cumulative sign-ups at the end of each week. Accounts created before the
 * first week are included in its starting total.
 */
export function cumulativeByWeek(
  timestamps: readonly string[],
  weeks: readonly string[],
) {
  const createdWeeks = timestamps.map((timestamp) =>
    weekStart(canberraDay(timestamp)),
  );
  return weeks.map(
    (week) => createdWeeks.filter((created) => created <= week).length,
  );
}

/** Distinct actors per week, from (actor, timestamp) pairs. */
export function distinctActorsByWeek(
  activity: readonly { actorId: string; at: string }[],
  weeks: readonly string[],
) {
  const actors = new Map(weeks.map((week) => [week, new Set<string>()]));
  for (const { actorId, at } of activity) {
    actors.get(weekStart(canberraDay(at)))?.add(actorId);
  }
  return weeks.map((week) => actors.get(week)?.size ?? 0);
}

const SHORT_DAY = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A YYYY-MM-DD day as "6 Oct". */
export function shortDayLabel(day: string) {
  return SHORT_DAY.format(new Date(`${day}T00:00:00Z`));
}
