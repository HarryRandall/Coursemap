import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import {
  tdDesignationFromEvidence,
  type HistoricalTdContext,
  type TdProvenance,
} from "./td-designation";

const EVIDENCE_BATCH_SIZE = 100;
const ATTEMPT_BATCH_SIZE = 200;

type CourseYear = { code: string; year: number };
type AttemptPeriod = { id: string; academic_period_id: number | null };
type PublishedEvidence = {
  record_id: number;
  snapshot_id: number;
  code: string;
  academic_year: number;
  tags: string[];
  provenance: unknown;
};

function provenanceRows(value: unknown): TdProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TdProvenance[] => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row.field_path !== "string" ||
      typeof row.method !== "string" ||
      !(
        typeof row.confidence === "number" ||
        typeof row.confidence === "string" ||
        row.confidence === null
      ) ||
      !(
        typeof row.source_locator === "string" || row.source_locator === null
      ) ||
      !(typeof row.source_excerpt === "string" || row.source_excerpt === null)
    )
      return [];
    return [
      {
        field_path: row.field_path,
        method: row.method,
        confidence: row.confidence,
        source_locator: row.source_locator,
        source_excerpt: row.source_excerpt,
      },
    ];
  });
}

function normalisedSelections(selections: readonly CourseYear[]) {
  const unique = new Map<string, CourseYear>();
  for (const selection of selections) {
    const code = selection.code.trim().toUpperCase();
    if (
      !/^[A-Z]{4}\d{4}[A-Z]?$/u.test(code) ||
      !Number.isInteger(selection.year) ||
      selection.year < 2000 ||
      selection.year > 2200
    )
      continue;
    unique.set(`${code}:${selection.year}`, { code, year: selection.year });
  }
  return [...unique.values()].sort(
    (a, b) => a.year - b.year || a.code.localeCompare(b.code),
  );
}

const readPublishedDesignations = cache(async (key: string) => {
  const selections = JSON.parse(key) as CourseYear[];
  const facts: HistoricalTdContext["designationByCourseYear"][number][] = [];
  const client = createPublicClient();
  for (let start = 0; start < selections.length; start += EVIDENCE_BATCH_SIZE) {
    const batch = selections.slice(start, start + EVIDENCE_BATCH_SIZE);
    // Missing evidence must not erase completed credit or promote an alias.
    let data: PublishedEvidence[] = [];
    try {
      const result = await client.rpc(
        "published_course_td_designation_evidence",
        { p_selections: batch },
      );
      if (result.error) throw result.error;
      data = result.data ?? [];
    } catch (error) {
      console.error("The historical TD evidence could not be read.", error);
    }
    for (const selection of batch) {
      const matches = data.filter(
        (row) =>
          row.code === selection.code && row.academic_year === selection.year,
      );
      const row = matches.length === 1 ? matches[0] : undefined;
      const provenance = row?.provenance;
      facts.push({
        ...selection,
        status:
          row &&
          Number.isSafeInteger(row.record_id) &&
          row.record_id > 0 &&
          Number.isSafeInteger(row.snapshot_id) &&
          row.snapshot_id > 0 &&
          Array.isArray(row.tags) &&
          row.tags.every((tag) => typeof tag === "string") &&
          Array.isArray(provenance)
            ? tdDesignationFromEvidence({
                ...selection,
                tags: row.tags,
                provenance: provenanceRows(provenance),
              })
            : "unknown",
      });
    }
  }
  return facts;
});

/** Equivalent selections share one request-local read, without a global history cache. */
export function loadPublishedTdDesignations(selections: readonly CourseYear[]) {
  const normalised = normalisedSelections(selections);
  return normalised.length
    ? readPublishedDesignations(JSON.stringify(normalised))
    : Promise.resolve([]);
}

const readAttemptPeriods = cache(async (key: string) => {
  const ids = key.split(",").map(Number);
  const client = await createClient();
  const years = new Map<number, number>();
  for (let start = 0; start < ids.length; start += ATTEMPT_BATCH_SIZE) {
    const { data, error } = await client
      .from("academic_periods")
      .select("id,calendar_year")
      .in("id", ids.slice(start, start + ATTEMPT_BATCH_SIZE));
    if (error)
      console.error("The attempt calendar years could not be read.", error);
    else
      for (const period of data ?? [])
        years.set(period.id, period.calendar_year);
  }
  return years;
});

/** A saved course edition or plan year is not the year the attempt took place. */
export async function loadAttemptCalendarYears(
  attempts: readonly AttemptPeriod[],
) {
  const ids = [
    ...new Set(
      attempts.flatMap((attempt) =>
        Number.isSafeInteger(attempt.academic_period_id) &&
        attempt.academic_period_id! > 0
          ? [attempt.academic_period_id!]
          : [],
      ),
    ),
  ].sort((a, b) => a - b);
  const periods = ids.length
    ? await readAttemptPeriods(ids.join(","))
    : new Map<number, number>();
  return Object.fromEntries(
    attempts.flatMap((attempt) => {
      const year =
        attempt.academic_period_id === null
          ? undefined
          : periods.get(attempt.academic_period_id);
      return year === undefined ? [] : [[attempt.id, year]];
    }),
  );
}

const readOwnedAttemptProjections = cache(async (key: string) => {
  const ids = key.split(",").map(Number);
  const client = await createClient();
  const rows = [];
  for (let start = 0; start < ids.length; start += ATTEMPT_BATCH_SIZE) {
    const { data, error } = await client.rpc(
      "current_user_course_attempt_version_projections",
      {
        p_version_ids: ids.slice(start, start + ATTEMPT_BATCH_SIZE),
      },
    );
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
});

/** The existing owner-only RPC supplies the trusted historical snapshot boundary. */
export function loadOwnedAttemptProjections(versionIds: readonly number[]) {
  const ids = [
    ...new Set(versionIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ].sort((a, b) => a - b);
  return ids.length
    ? readOwnedAttemptProjections(ids.join(","))
    : Promise.resolve([]);
}
