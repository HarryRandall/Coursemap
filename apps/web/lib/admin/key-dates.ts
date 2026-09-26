import "server-only";
import type { ImportDiagnostic } from "@/lib/catalogue-import/import-source";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { createClient } from "@/lib/supabase/server";

export type KeyDatesYearSummary = {
  year: number;
  publishedCount: number;
  publishedAt: string | null;
  hasPendingReview: boolean;
};

export type KeyDatesReview = {
  id: string;
  canonicalUrl: string;
  fetchedAt: string;
  requestedAt: string;
  events: { date: string; title: string }[];
  diagnostics: ImportDiagnostic[];
};

export type KeyDatesImportRun = {
  id: string;
  importedAt: string;
  status: "succeeded" | "failed";
  added: number;
  changed: number;
  archived: number;
  unchanged: number;
};

export type AdminKeyDatesYear = {
  years: KeyDatesYearSummary[];
  year: number;
  published: { date: string; title: string }[];
  review: KeyDatesReview | null;
  history: KeyDatesImportRun[];
};

function eventList(value: unknown): { date: string; title: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.date === "string" &&
    typeof item.title === "string"
      ? [{ date: item.date, title: item.title }]
      : [],
  );
}

function diagnosticList(value: unknown): ImportDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.code === "string" &&
    typeof item.message === "string" &&
    (item.severity === "warning" || item.severity === "error")
      ? [
          {
            code: item.code,
            message: item.message,
            severity: item.severity,
            field: typeof item.field === "string" ? item.field : undefined,
          },
        ]
      : [],
  );
}

/**
 * Everything the key dates admin page shows for one year, plus the status of
 * every other year for the year strip. Throws when any read fails so the page
 * reports an outage instead of presenting a year as never synced.
 */
export async function loadAdminKeyDatesYear(
  year: number,
): Promise<AdminKeyDatesYear> {
  const supabase = await createClient();
  const [yearsResult, publishedResult, pendingResult, eventsResult] =
    await Promise.all([
      supabase
        .from("academic_years")
        .select("id,year,calendar_published_at")
        .order("year", { ascending: false }),
      readAllRows((from, to) =>
        supabase
          .from("university_calendar_events")
          .select("calendar_year")
          .eq("status", "published")
          .order("id")
          .range(from, to),
      ),
      supabase
        .from("university_calendar_reviews")
        .select(
          "id,calendar_year,canonical_url,fetched_at,requested_at,events,diagnostics",
        )
        .eq("status", "pending"),
      supabase
        .from("university_calendar_events")
        .select("event_date,title")
        .eq("status", "published")
        .eq("calendar_year", year)
        .order("event_date")
        .order("title"),
    ]);
  if (
    yearsResult.error ||
    publishedResult.error ||
    pendingResult.error ||
    eventsResult.error
  ) {
    throw new Error("The key dates administration data could not be loaded.");
  }

  const publishedCounts = new Map<number, number>();
  for (const row of publishedResult.data) {
    publishedCounts.set(
      row.calendar_year,
      (publishedCounts.get(row.calendar_year) ?? 0) + 1,
    );
  }
  const pending = pendingResult.data ?? [];
  const years = (yearsResult.data ?? []).map((row) => ({
    year: row.year,
    publishedCount: publishedCounts.get(row.year) ?? 0,
    publishedAt: row.calendar_published_at,
    hasPendingReview: pending.some(
      (review) => review.calendar_year === row.year,
    ),
  }));
  if (!years.some((item) => item.year === year)) {
    years.push({
      year,
      publishedCount: 0,
      publishedAt: null,
      hasPendingReview: false,
    });
    years.sort((a, b) => b.year - a.year);
  }

  const academicYearId = yearsResult.data?.find((row) => row.year === year)?.id;
  let history: KeyDatesImportRun[] = [];
  if (academicYearId !== undefined) {
    const { data, error } = await supabase
      .from("university_calendar_imports")
      .select(
        "id,imported_at,status,added_count,changed_count,archived_count,unchanged_count",
      )
      .eq("academic_year_id", academicYearId)
      .order("imported_at", { ascending: false })
      .limit(10);
    if (error) {
      throw new Error("The key dates import history could not be loaded.");
    }
    history = (data ?? []).map((run) => ({
      id: run.id,
      importedAt: run.imported_at,
      status: run.status === "failed" ? "failed" : "succeeded",
      added: run.added_count,
      changed: run.changed_count,
      archived: run.archived_count,
      unchanged: run.unchanged_count,
    }));
  }

  const reviewRow = pending.find((review) => review.calendar_year === year);
  return {
    years,
    year,
    published: (eventsResult.data ?? []).map((row) => ({
      date: row.event_date,
      title: row.title,
    })),
    review: reviewRow
      ? {
          id: reviewRow.id,
          canonicalUrl: reviewRow.canonical_url,
          fetchedAt: reviewRow.fetched_at,
          requestedAt: reviewRow.requested_at,
          events: eventList(reviewRow.events),
          diagnostics: diagnosticList(reviewRow.diagnostics),
        }
      : null,
    history,
  };
}
