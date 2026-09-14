import {
  requirementBucketStatus,
  type RequirementBucketProgress,
} from "@/lib/coursemap/requirement-progress";
import type { Attempt } from "@/lib/coursemap/types";
import {
  effectiveStatus,
  missingPrereqs,
  planningCourseForAttempt,
  type DegreeUnitProgress,
  type PlanningCatalogue,
} from "@/lib/planner";

export type PlanRisk = {
  id: string;
  title: string;
  detail: string;
  severity: "warning" | "info";
};

/**
 * Everything in the plan that needs a decision, worst first.
 *
 * Each risk is derived from the plan itself — a requirement short of its
 * target, a prerequisite the plan does not satisfy, units with nowhere to go —
 * so an empty list genuinely means nothing is outstanding.
 */
export function planRisks({
  buckets,
  attempts,
  catalogue,
  progress,
}: {
  buckets: readonly RequirementBucketProgress[];
  attempts: Attempt[];
  catalogue: PlanningCatalogue;
  progress: DegreeUnitProgress;
}): PlanRisk[] {
  const shortfalls = buckets.flatMap((bucket) => {
    const { status, label } = requirementBucketStatus(bucket);
    if (status !== "short") return [];
    return [
      {
        id: `bucket-${bucket.key}`,
        title: bucket.title,
        detail: `${label.replace("u short", " units")} still to place against this ${bucket.kind.toLowerCase()}.`,
        severity: "warning" as const,
      },
    ];
  });

  const blocked = attempts.flatMap((attempt) => {
    const status = effectiveStatus(attempt, attempts, catalogue);
    if (status !== "blocked" && status !== "approval") return [];
    const course = planningCourseForAttempt(attempt, catalogue);
    if (!course) return [];
    const missing = missingPrereqs(attempt, attempts, catalogue);
    return [
      {
        id: `attempt-${attempt.id}`,
        title: `${course.code} ${course.name}`,
        detail:
          status === "blocked"
            ? `Prerequisites not met in the plan: ${missing.join(", ")}.`
            : "Needs permission or a prerequisite check before enrolment.",
        severity:
          status === "blocked" ? ("warning" as const) : ("info" as const),
      },
    ];
  });

  const unallocated =
    progress.remaining > 0
      ? [
          {
            id: "unallocated",
            title: "Units without a course",
            detail: `${progress.remaining} of ${progress.total} units have no course in the plan yet.`,
            severity: "info" as const,
          },
        ]
      : [];

  return [...shortfalls, ...blocked, ...unallocated].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1,
  );
}
