"use server";

import { revalidatePath } from "next/cache";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import {
  fetchUniversityCalendarManifest,
  universityCalendarErrorDiagnostics,
} from "@/lib/catalogue-import/anu-university-calendar";
import { createClient } from "@/lib/supabase/server";

export type KeyDatesActionResult = {
  ok: boolean;
  message: string;
  /** True once a sync is saved for review, even one with source errors. */
  staged?: boolean;
};

const FETCH_TIMEOUT_MS = 20_000;
const PERMISSION_REQUIRED = "Import management permission is required.";

function isCalendarYear(year: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2200;
}

function refreshKeyDates(year: number) {
  revalidatePath(`/admin/key-dates/${year}`, "layout");
  revalidatePath("/key-dates");
}

/**
 * Fetches one year from the ANU university calendar and stages it for review.
 * Students see nothing new until the review is approved.
 */
export async function syncKeyDatesAction(
  year: number,
): Promise<KeyDatesActionResult> {
  if (!(await canManageCatalogueOperations()))
    return { ok: false, message: PERMISSION_REQUIRED };
  if (!isCalendarYear(year))
    return { ok: false, message: "Choose a year between 2000 and 2200." };

  let manifest;
  try {
    manifest = await fetchUniversityCalendarManifest({
      calendarYear: year,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      message: `The ANU calendar for ${year} could not be fetched. Try again shortly.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("stage_university_calendar_review", {
    p_calendar_year: year,
    p_parser_version: manifest.parserVersion,
    p_source: manifest.source,
    p_document: manifest.document,
    p_events: manifest.events,
    p_diagnostics: manifest.diagnostics,
  });
  if (error)
    return {
      ok: false,
      message: `The ${year} sync could not be saved for review.`,
    };

  refreshKeyDates(year);
  const errors = universityCalendarErrorDiagnostics(manifest).length;
  return {
    ok: errors === 0,
    staged: true,
    message:
      errors > 0
        ? `The ${year} calendar has ${errors} source ${errors === 1 ? "error" : "errors"} to resolve before it can be published.`
        : `${manifest.events.length} dates are ready to review for ${year}.`,
  };
}

export async function approveKeyDatesReviewAction(
  reviewId: string,
  year: number,
): Promise<KeyDatesActionResult> {
  if (!(await canManageCatalogueOperations()))
    return { ok: false, message: PERMISSION_REQUIRED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_university_calendar_review", {
    p_review_id: reviewId,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "55000" || error.code === "22023"
          ? error.message
          : "The key dates could not be published. Try again.",
    };

  refreshKeyDates(year);
  return { ok: true, message: `Key dates for ${year} are published.` };
}

export async function discardKeyDatesReviewAction(
  reviewId: string,
  year: number,
): Promise<KeyDatesActionResult> {
  if (!(await canManageCatalogueOperations()))
    return { ok: false, message: PERMISSION_REQUIRED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_university_calendar_review", {
    p_review_id: reviewId,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "55000"
          ? error.message
          : "The sync could not be discarded. Try again.",
    };

  refreshKeyDates(year);
  return { ok: true, message: `The ${year} sync was discarded.` };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Adds a key date by hand, or edits a published one when `id` is given.
 * Either way the date is kept through later ANU syncs.
 */
export async function saveKeyDateAction(
  year: number,
  entry: { id?: number; date: string; title: string },
): Promise<KeyDatesActionResult> {
  if (!(await canManageCatalogueOperations()))
    return { ok: false, message: PERMISSION_REQUIRED };
  const title = entry.title.trim();
  if (!title) return { ok: false, message: "Give the date a title." };
  if (!ISO_DATE.test(entry.date) || !entry.date.startsWith(`${year}-`))
    return { ok: false, message: `Choose a date in ${year}.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_university_calendar_event", {
    p_event_id: entry.id ?? undefined,
    p_calendar_year: year,
    p_event_date: entry.date,
    p_title: title,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505" ||
        error.code === "22023" ||
        error.code === "P0002"
          ? error.message
          : "The key date could not be saved. Try again.",
    };

  refreshKeyDates(year);
  return {
    ok: true,
    message: entry.id ? "The key date was updated." : "The key date was added.",
  };
}

export async function removeKeyDateAction(
  year: number,
  id: number,
): Promise<KeyDatesActionResult> {
  if (!(await canManageCatalogueOperations()))
    return { ok: false, message: PERMISSION_REQUIRED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_university_calendar_event", {
    p_event_id: id,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "P0002"
          ? error.message
          : "The key date could not be removed. Try again.",
    };

  refreshKeyDates(year);
  return { ok: true, message: "The key date was removed." };
}
