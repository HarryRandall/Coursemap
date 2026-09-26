import "server-only";
import { cache } from "react";
import type { ImportDiagnostic } from "@/lib/catalogue-import/import-source";
import { createClient } from "@/lib/supabase/server";

export type KeyDatesReview = {
  id: string;
  canonicalUrl: string;
  fetchedAt: string;
  requestedAt: string;
  /** `manual` marks a date corrected during review. */
  events: { date: string; title: string; manual?: boolean }[];
  diagnostics: ImportDiagnostic[];
};

export type KeyDatesPublishedEvent = {
  id: number;
  date: string;
  title: string;
  origin: "anu" | "manual";
};

export type KeyDatesChangelogEntry =
  | {
      kind: "publication";
      id: string;
      at: string;
      actor: string | null;
      /** False for a run from the command-line importer. */
      fromConsole: boolean;
      failed: boolean;
      added: number;
      restored: number;
      archived: number;
      unchanged: number;
    }
  | {
      kind: "discarded";
      id: string;
      at: string;
      actor: string | null;
      dates: number;
    }
  | {
      kind: "manual";
      id: string;
      at: string;
      actor: string | null;
      action: "added" | "edited" | "removed";
      date: string;
      title: string;
      previousDate: string | null;
      previousTitle: string | null;
    };

export type AdminKeyDatesYear = {
  years: number[];
  year: number;
  publishedAt: string | null;
  published: KeyDatesPublishedEvent[];
  review: KeyDatesReview | null;
  changelog: KeyDatesChangelogEntry[];
};

const CHANGELOG_LIMIT = 50;

function eventList(
  value: unknown,
): { date: string; title: string; manual?: boolean }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof item.date === "string" &&
    typeof item.title === "string"
      ? [{ date: item.date, title: item.title, manual: item.manual === true }]
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
 * Everything the key dates admin page shows for one year: the published
 * dates, any sync waiting for review and the year's changelog. Throws when a
 * read fails so the page reports an outage instead of an empty year.
 */
export const loadAdminKeyDatesYear = cache(async function loadAdminKeyDatesYear(
  year: number,
): Promise<AdminKeyDatesYear> {
  const supabase = await createClient();
  const [yearsResult, eventsResult, reviewsResult, changesResult] =
    await Promise.all([
      supabase
        .from("academic_years")
        .select("id,year,calendar_published_at")
        .order("year", { ascending: false }),
      supabase
        .from("university_calendar_events")
        .select("id,event_date,title,origin")
        .eq("status", "published")
        .eq("calendar_year", year)
        .order("event_date")
        .order("title"),
      supabase
        .from("university_calendar_reviews")
        .select(
          "id,status,canonical_url,fetched_at,requested_at,events,diagnostics,decided_by,decided_at,import_id",
        )
        .eq("calendar_year", year)
        .in("status", ["pending", "approved", "discarded"])
        .order("requested_at", { ascending: false })
        .limit(CHANGELOG_LIMIT),
      supabase
        .from("university_calendar_event_changes")
        .select(
          "id,action,event_date,title,previous_date,previous_title,changed_by,changed_at",
        )
        .eq("calendar_year", year)
        .order("changed_at", { ascending: false })
        .limit(CHANGELOG_LIMIT),
    ]);
  if (
    yearsResult.error ||
    eventsResult.error ||
    reviewsResult.error ||
    changesResult.error
  ) {
    throw new Error("The key dates administration data could not be loaded.");
  }

  const yearRow = yearsResult.data.find((row) => row.year === year);
  const years = [
    ...new Set([...yearsResult.data.map((row) => row.year), year]),
  ];

  let imports: {
    id: string;
    imported_at: string;
    status: string;
    added_count: number;
    changed_count: number;
    archived_count: number;
    unchanged_count: number;
  }[] = [];
  if (yearRow) {
    const { data, error } = await supabase
      .from("university_calendar_imports")
      .select(
        "id,imported_at,status,added_count,changed_count,archived_count,unchanged_count",
      )
      .eq("academic_year_id", yearRow.id)
      .order("imported_at", { ascending: false })
      .limit(CHANGELOG_LIMIT);
    if (error) {
      throw new Error("The key dates import history could not be loaded.");
    }
    imports = data;
  }

  const reviews = reviewsResult.data;
  const changes = changesResult.data;
  const actorIds = [
    ...new Set(
      [
        ...reviews.map((review) => review.decided_by),
        ...changes.map((change) => change.changed_by),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    // Names are a courtesy: an unreadable profile leaves the entry unattributed.
    const { data } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", actorIds);
    for (const profile of data ?? []) {
      actorNames.set(profile.id, profile.display_name);
    }
  }
  const actor = (id: string | null) =>
    id ? (actorNames.get(id) ?? null) : null;
  const approvals = new Map(
    reviews
      .filter((review) => review.import_id)
      .map((review) => [review.import_id, review]),
  );

  const changelog: KeyDatesChangelogEntry[] = [
    ...imports.map((run) => {
      const approval = approvals.get(run.id);
      return {
        kind: "publication" as const,
        id: run.id,
        at: run.imported_at,
        actor: actor(approval?.decided_by ?? null),
        fromConsole: Boolean(approval),
        failed: run.status === "failed",
        added: run.added_count,
        restored: run.changed_count,
        archived: run.archived_count,
        unchanged: run.unchanged_count,
      };
    }),
    ...reviews
      .filter((review) => review.status === "discarded" && review.decided_at)
      .map((review) => ({
        kind: "discarded" as const,
        id: review.id,
        at: review.decided_at as string,
        actor: actor(review.decided_by),
        dates: eventList(review.events).length,
      })),
    ...changes.map((change) => ({
      kind: "manual" as const,
      id: String(change.id),
      at: change.changed_at,
      actor: actor(change.changed_by),
      action: (change.action === "edited" || change.action === "removed"
        ? change.action
        : "added") as "added" | "edited" | "removed",
      date: change.event_date,
      title: change.title,
      previousDate: change.previous_date,
      previousTitle: change.previous_title,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const pending = reviews.find((review) => review.status === "pending");
  return {
    years,
    year,
    publishedAt: yearRow?.calendar_published_at ?? null,
    published: eventsResult.data.map((row) => ({
      id: row.id,
      date: row.event_date,
      title: row.title,
      origin: row.origin === "manual" ? "manual" : "anu",
    })),
    review: pending
      ? {
          id: pending.id,
          canonicalUrl: pending.canonical_url,
          fetchedAt: pending.fetched_at,
          requestedAt: pending.requested_at,
          events: eventList(pending.events),
          diagnostics: diagnosticList(pending.diagnostics),
        }
      : null,
    changelog: changelog.slice(0, CHANGELOG_LIMIT),
  };
});
