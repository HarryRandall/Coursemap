// Academic dates and admin timestamps follow Canberra time whatever the
// server or browser time zone.
export const ACADEMIC_TIME_ZONE = "Australia/Sydney";

const ISO_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ACADEMIC_TIME_ZONE,
});

/** The academic calendar date of an instant, as YYYY-MM-DD. */
export function canberraTodayIso(now: Date = new Date()) {
  return ISO_DAY.format(now);
}

const DAY = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: ACADEMIC_TIME_ZONE,
});
const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: ACADEMIC_TIME_ZONE,
});
const DATE_TIME = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: ACADEMIC_TIME_ZONE,
});
const COUNT = new Intl.NumberFormat("en-AU");

type Instant = Date | string;

const toDate = (value: Instant) =>
  typeof value === "string" ? new Date(value) : value;

/** "7 Oct" */
export function formatCanberraDay(value: Instant) {
  return DAY.format(toDate(value));
}

/** "7 Oct 2026" */
export function formatCanberraDate(value: Instant) {
  return DATE.format(toDate(value));
}

/** "7 Oct, 9:12 am" */
export function formatCanberraDateTime(value: Instant) {
  return DATE_TIME.format(toDate(value));
}

/** "3,012" */
export function formatCount(value: number) {
  return COUNT.format(value);
}
