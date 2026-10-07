import "server-only";

import {
  countByDay,
  cumulativeByWeek,
  distinctActorsByWeek,
  recentDays,
  recentWeeks,
} from "@/lib/admin/dashboard-series";
import { createClient } from "@/lib/supabase/server";
import { readAllRows, readRowsForIds } from "@/lib/supabase/read-all-rows";

const SYNC_DAYS = 30;
const CHANGE_WEEKS = 26;
const USER_WEEKS = 12;
const TOP_COURSE_COUNT = 6;

export const READINESS_KINDS = [
  { kind: "course", label: "Courses" },
  { kind: "programme", label: "Programmes" },
  { kind: "major", label: "Majors" },
  { kind: "minor", label: "Minors" },
  { kind: "specialisation", label: "Specialisations" },
] as const;

export type SyncOutcomeDay = {
  day: string;
  applied: number;
  review: number;
  failed: number;
  cancelled: number;
};

export type AttentionQueue = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "neutral";
};

export type ReadinessYear = { year: number; published: number; total: number };

export type AdminDashboardData = {
  generatedAt: string;
  /** This year's published courses, as a running total at each week's end. */
  publishedCourses: { weeks: string[]; cumulative: number[] };
  users: {
    total: number;
    newThisWeek: number;
    weeks: string[];
    cumulative: number[];
    active: number[];
  };
  /** Null when the viewer cannot read catalogue syncs. */
  syncs: SyncOutcomeDay[] | null;
  queues: AttentionQueue[];
  readiness: {
    kind: string;
    label: string;
    years: ReadinessYear[];
  }[];
  /** Null when the viewer cannot read catalogue change history. */
  changes: { day: string; count: number }[] | null;
  topCourses: { code: string; students: number }[];
  /** Null until the SELT tables exist and the viewer can read them. */
  selt: {
    publishedCourses: number;
    ready: number;
    blocked: number;
  } | null;
};

/** Every page of a query, throwing on error so a section fails as a whole. */
async function allRows<Row>(
  readPage: Parameters<typeof readAllRows<Row>>[0],
): Promise<Row[]> {
  const { data, error } = await readAllRows(readPage);
  if (error) throw new Error(error.message);
  return data;
}

/** Resolves to null instead of throwing, for sections a viewer may not see. */
async function optional<Value>(load: () => Promise<Value>) {
  try {
    return await load();
  } catch {
    return null;
  }
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

async function loadUsers(now: Date) {
  const supabase = await createClient();
  const weeks = recentWeeks(now, USER_WEEKS);
  // One spare week covers the partial first week; bucketing drops the excess.
  const since = daysAgo(now, (USER_WEEKS + 1) * 7);
  const [accounts, plans, items] = await Promise.all([
    allRows<{ user_id: string | null; created_at: string | null }>((from, to) =>
      supabase
        .from("admin_users")
        .select("user_id,created_at")
        .order("user_id")
        .range(from, to),
    ),
    allRows<{ owner_id: string; updated_at: string }>((from, to) =>
      supabase
        .from("plans")
        .select("id,owner_id,updated_at")
        .gte("updated_at", since)
        .order("id")
        .range(from, to),
    ),
    allRows<{ owner_id: string; updated_at: string }>((from, to) =>
      supabase
        .from("plan_items")
        .select("id,owner_id,updated_at")
        .gte("updated_at", since)
        .order("id")
        .range(from, to),
    ),
  ]);
  const created = accounts
    .map((row) => row.created_at)
    .filter((value): value is string => typeof value === "string");
  const cumulative = cumulativeByWeek(created, weeks);
  return {
    total: created.length,
    newThisWeek: cumulative.at(-1)! - (cumulative.at(-2) ?? 0),
    weeks,
    cumulative,
    active: distinctActorsByWeek(
      [...plans, ...items].map((row) => ({
        actorId: row.owner_id,
        at: row.updated_at,
      })),
      weeks,
    ),
  };
}

async function loadSyncs(now: Date) {
  const supabase = await createClient();
  const rows = await allRows<{
    record_id: number;
    status: string;
    created_at: string;
  }>((from, to) =>
    supabase
      .from("catalogue_syncs")
      .select("id,record_id,status,created_at")
      .gte("created_at", daysAgo(now, SYNC_DAYS + 1))
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  const days = recentDays(now, SYNC_DAYS);
  const bucket = (status: string) =>
    new Map(
      countByDay(
        rows
          .filter((row) => row.status === status)
          .map((row) => row.created_at),
        days,
      ).map((entry) => [entry.day, entry.count]),
    );
  const applied = bucket("applied");
  const review = bucket("review_required");
  const failed = bucket("failed");
  const cancelled = bucket("cancelled");
  const outcomes: SyncOutcomeDay[] = days.map((day) => ({
    day,
    applied: applied.get(day) ?? 0,
    review: review.get(day) ?? 0,
    failed: failed.get(day) ?? 0,
    cancelled: cancelled.get(day) ?? 0,
  }));

  // A record only needs attention while its most recent sync is unresolved.
  const latest = new Map<number, string>();
  for (const row of rows) latest.set(row.record_id, row.status);
  const latestCount = (statuses: string[]) =>
    [...latest.values()].filter((status) => statuses.includes(status)).length;

  return {
    outcomes,
    failed: latestCount(["failed"]),
    review: latestCount(["review_required"]),
    active: latestCount(["queued", "running", "paused"]),
  };
}

async function loadReadiness(now: Date) {
  const supabase = await createClient();
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const { data: yearRows, error } = await supabase
    .from("academic_years")
    .select("id,year")
    .in("year", years);
  if (error) throw new Error(error.message);
  const yearById = new Map((yearRows ?? []).map((row) => [row.id, row.year]));
  const records = yearById.size
    ? await allRows<{
        kind: string;
        academic_year_id: number;
        published_version_id: number | null;
        code_id: number;
      }>((from, to) =>
        supabase
          .from("catalogue_records")
          .select("id,kind,academic_year_id,published_version_id,code_id")
          .in("academic_year_id", [...yearById.keys()])
          .is("archived_at", null)
          .order("id")
          .range(from, to),
      )
    : [];
  const readiness = READINESS_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    years: years.map((year) => {
      const matching = records.filter(
        (record) =>
          record.kind === kind &&
          yearById.get(record.academic_year_id) === year,
      );
      return {
        year,
        total: matching.length,
        published: matching.filter((record) => record.published_version_id)
          .length,
      };
    }),
  }));
  const publishedCourseCodes = new Set(
    records
      .filter(
        (record) =>
          record.kind === "course" &&
          record.published_version_id &&
          yearById.get(record.academic_year_id) === years[0],
      )
      .map((record) => record.code_id),
  );
  return { readiness, publishedCourseCodes };
}

async function loadPublishedCourses(now: Date) {
  const supabase = await createClient();
  const weeks = recentWeeks(now, USER_WEEKS);
  const rows = await allRows<{ published_at: string }>((from, to) =>
    supabase
      .from("catalogue_publications")
      .select(
        "id,published_at,catalogue_records!inner(kind,academic_years!inner(year))",
      )
      .is("unpublished_at", null)
      .eq("catalogue_records.kind", "course")
      .eq("catalogue_records.academic_years.year", now.getFullYear())
      .order("id")
      .range(from, to),
  );
  return {
    weeks,
    cumulative: cumulativeByWeek(
      rows.map((row) => row.published_at),
      weeks,
    ),
  };
}

async function loadChanges(now: Date) {
  const supabase = await createClient();
  // Whole weeks from a Monday, so every calendar column is complete.
  const firstDay = recentWeeks(now, CHANGE_WEEKS)[0];
  const today = recentDays(now, 1)[0];
  const dayCount = (Date.parse(today) - Date.parse(firstDay)) / 86_400_000 + 1;
  const rows = await allRows<{ created_at: string }>((from, to) =>
    supabase
      .from("catalogue_change_events")
      .select("id,created_at")
      .gte("created_at", daysAgo(now, dayCount + 1))
      .order("id")
      .range(from, to),
  );
  return countByDay(
    rows.map((row) => row.created_at),
    recentDays(now, dayCount),
  );
}

async function loadTopCourses() {
  const supabase = await createClient();
  const items = await allRows<{
    owner_id: string;
    catalogue_record_id: number;
  }>((from, to) =>
    supabase
      .from("plan_items")
      .select("id,owner_id,catalogue_record_id")
      .order("id")
      .range(from, to),
  );
  const recordIds = [...new Set(items.map((item) => item.catalogue_record_id))];
  const { data: records, error } = await readRowsForIds(
    recordIds,
    (batch, from, to) =>
      supabase
        .from("catalogue_records")
        .select("id,catalogue_codes(code)")
        .in("id", batch)
        .order("id")
        .range(from, to),
  );
  if (error) throw new Error(error.message);
  const codeByRecord = new Map<number, string>();
  for (const row of records) {
    const code = row.catalogue_codes?.code;
    if (code) codeByRecord.set(row.id, code);
  }
  // A course planned in two years by the same student counts once.
  const students = new Map<string, Set<string>>();
  for (const item of items) {
    const code = codeByRecord.get(item.catalogue_record_id);
    if (!code) continue;
    if (!students.has(code)) students.set(code, new Set());
    students.get(code)!.add(item.owner_id);
  }
  return [...students]
    .map(([code, owners]) => ({ code, students: owners.size }))
    .sort((left, right) => right.students - left.students)
    .slice(0, TOP_COURSE_COUNT);
}

async function loadSelt(publishedCourseCodes: ReadonlySet<number>) {
  const supabase = await createClient();
  const reports = await allRows<{
    code_id: number;
    published_at: string | null;
    warnings: string[];
  }>((from, to) =>
    supabase
      .from("selt_reports")
      .select("id,code_id,published_at,warnings")
      .order("id")
      .range(from, to),
  );
  const drafts = reports.filter((report) => !report.published_at);
  return {
    publishedCourses: new Set(
      reports
        .filter(
          (report) =>
            report.published_at && publishedCourseCodes.has(report.code_id),
        )
        .map((report) => report.code_id),
    ).size,
    ready: drafts.filter((report) => report.warnings.length === 0).length,
    blocked: drafts.filter((report) => report.warnings.length > 0).length,
  };
}

async function loadPendingKeyDateReviews() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("university_calendar_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function loadAdminDashboard(
  now = new Date(),
): Promise<AdminDashboardData> {
  const [
    users,
    syncs,
    readiness,
    changes,
    topCourses,
    keyDateReviews,
    publishedCourses,
  ] = await Promise.all([
    loadUsers(now),
    optional(() => loadSyncs(now)),
    loadReadiness(now),
    optional(() => loadChanges(now)),
    loadTopCourses(),
    optional(loadPendingKeyDateReviews),
    loadPublishedCourses(now),
  ]);
  const selt = await optional(() => loadSelt(readiness.publishedCourseCodes));

  const queues: AttentionQueue[] = [];
  if (syncs) {
    queues.push(
      {
        key: "failed",
        label: "Failed syncs",
        count: syncs.failed,
        href: "/admin/operations/catalogue?status=failed",
        tone: "critical",
      },
      {
        key: "review",
        label: "Source changes to review",
        count: syncs.review,
        href: "/admin/operations/catalogue?status=review_required",
        tone: "warning",
      },
    );
  }
  if (keyDateReviews !== null) {
    queues.push({
      key: "key-dates",
      label: "Key-date reviews",
      count: keyDateReviews,
      href: "/admin/key-dates",
      tone: "warning",
    });
  }
  if (selt) {
    queues.push(
      {
        key: "selt-ready",
        label: "SELT drafts ready",
        count: selt.ready,
        href: "/admin/selt",
        tone: "warning",
      },
      {
        key: "selt-blocked",
        label: "SELT drafts blocked",
        count: selt.blocked,
        href: "/admin/selt",
        tone: "critical",
      },
    );
  }
  if (syncs) {
    queues.push({
      key: "active",
      label: "Syncs in progress",
      count: syncs.active,
      href: "/admin/operations/catalogue",
      tone: "neutral",
    });
  }

  return {
    generatedAt: now.toISOString(),
    publishedCourses,
    users,
    syncs: syncs?.outcomes ?? null,
    queues,
    readiness: readiness.readiness,
    changes,
    topCourses,
    selt,
  };
}

/** Courses published this calendar year, the denominator for SELT coverage. */
export function publishedCourseCount(data: AdminDashboardData) {
  const courses = data.readiness.find((entry) => entry.kind === "course");
  return courses?.years[0]?.published ?? 0;
}
