import type { CatalogueKind } from "@/lib/coursemap/catalogue-kinds";

/**
 * The facts ANU publishes alongside a code in its directory listing. They are
 * stored verbatim, so every reader has to tolerate a missing or unexpected
 * shape rather than trusting the keys to be there.
 */
type ListingSummary = {
  career?: unknown;
  units?: unknown;
  modeOfDelivery?: unknown;
  durationYears?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * The one-line description that sits under a record's title: what it is worth,
 * who it is for and how it runs. Only the parts ANU actually gave are
 * returned, so a sparse listing reads as a short line rather than a row of
 * dashes. Session is deliberately left out - ANU joins every offering into one
 * slash-separated string that is longer than the title it would sit beneath.
 */
export function catalogueSummaryMeta(
  summary: Record<string, unknown>,
  kind: CatalogueKind,
): string[] {
  const listing = summary as ListingSummary;
  const parts: string[] = [];
  const units = count(listing.units);
  if (units) parts.push(`${units} unit${units === 1 ? "" : "s"}`);
  const years = kind === "course" ? null : count(listing.durationYears);
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  const career = text(listing.career);
  if (career) parts.push(career);
  const mode = text(listing.modeOfDelivery);
  if (mode) parts.push(mode);
  return parts;
}
