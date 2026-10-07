// Admin timestamps are read in Canberra time whatever the server's zone, so a
// row uploaded at 9am says 9am to the operator who uploaded it.
const TIME_ZONE = "Australia/Sydney";

const DAY = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const DATE_TIME = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
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
