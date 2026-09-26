import { notFound } from "next/navigation";

/** The calendar year in the path, or a 404 when it is not one. */
export function calendarYearParam(raw: string) {
  const year = /^\d{4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) notFound();
  return year;
}
