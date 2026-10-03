import type { BulkImportKind } from "./kinds";
export type CourseRunProgress = {
  id: string;
  kind?: BulkImportKind;
  requested_by?: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  state: string;
  pause_reason: string | null;
  total: number;
  finished: number;
  review: number;
  drafts?: number;
  published_drafts?: number;
  failed: number;
  stopped?: number;
  imported: number;
  published: number;
  spent_usd: string;
  reserved_usd: string;
  budget_usd: string;
  publish_verified: boolean;
  publication_blockers: Array<{ reason: string; courses: number }>;
  paid_courses: number;
  free_courses: number;
};

export function courseRunCosts(run: CourseRunProgress) {
  const spent = Number(run.spent_usd);
  const reserved = Number(run.reserved_usd);
  const budget = Number(run.budget_usd);
  return {
    spent,
    reserved,
    budget,
    available: Math.max(0, budget - spent - reserved),
  };
}

/** Rates use completed imports; elapsed time includes pauses between requests. */
export function courseRunAnalysis(run: CourseRunProgress, now = Date.now()) {
  const complete = run.finished >= run.total || run.state === "cancelled";
  const start = run.started_at ? new Date(run.started_at).getTime() : NaN;
  const end = complete
    ? run.completed_at
      ? new Date(run.completed_at).getTime()
      : NaN
    : now;
  const elapsedSeconds =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 1000
      : null;
  const settled = run.paid_courses + run.free_courses;
  return {
    elapsedSeconds,
    coursesPerMinute:
      elapsedSeconds && run.imported > 0
        ? (run.imported * 60) / elapsedSeconds
        : null,
    publicationRate:
      run.imported > 0 ? (run.published / run.imported) * 100 : null,
    reviewRate: run.imported > 0 ? (run.review / run.imported) * 100 : null,
    averageCost: settled > 0 ? Number(run.spent_usd) / settled : null,
    paidAverageCost:
      run.paid_courses > 0 ? Number(run.spent_usd) / run.paid_courses : null,
    noChargeRate: settled > 0 ? (run.free_courses / settled) * 100 : null,
    settled,
  };
}

export function courseRunState(run: CourseRunProgress, active: boolean) {
  if (run.state === "cancelled") return "Stopped";
  if (run.state === "paused") return "Paused";
  if (run.finished === run.total) return "Finished";
  return active ? "Importing" : "Ready to continue";
}

export type CourseRunItem = {
  recordId: number;
  code: string;
  title: string;
  status: string;
  published: boolean;
  hasDraft: boolean;
  issues: string[];
  error: string | null;
  actualUsd: number | null;
};
export type CourseRunResults = {
  total: number;
  page: number;
  pageSize: number;
  items: CourseRunItem[];
};

export function courseRunItemState(item: CourseRunItem) {
  if (item.status === "failed") return "Failed";
  if (item.status === "cancelled") return "Stopped";
  if (item.status === "running") return "Importing";
  if (item.status === "queued") return "Queued";
  if (item.status === "paused") return "Paused";
  if (item.published)
    return item.hasDraft ? "Published with draft" : "Published";
  if (item.issues.length) return "Needs review";
  if (item.hasDraft) return "Draft ready";
  return "Pending";
}

/** Mutually exclusive segments leave stopped and unclassified work neutral. */
export function courseRunSegments(run: CourseRunProgress) {
  const finished = Math.min(run.total, Math.max(0, run.finished));
  const failed = Math.min(finished, Math.max(0, run.failed));
  const review = Math.min(finished - failed, Math.max(0, run.review));
  const published = Math.min(
    finished - failed - review,
    Math.max(0, run.published),
  );
  const drafts = Math.min(
    finished - failed - review - published,
    Math.max(0, run.drafts ?? run.imported - run.published - run.review),
  );
  const stopped = Math.min(
    finished - failed - review - published - drafts,
    Math.max(0, run.stopped ?? 0),
  );
  return {
    published,
    drafts,
    review,
    failed,
    stopped,
    other: finished - published - drafts - review - failed - stopped,
    pending: Math.max(0, run.total - finished),
  };
}
