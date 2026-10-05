import { Badge } from "@coursemap/ui/components/badge";
import { LoaderCircle } from "lucide-react";
import {
  courseRunAnalysis,
  courseRunCosts,
  courseRunSegments,
  courseRunState,
  type CourseRunProgress as Run,
} from "@/lib/catalogue-runs/progress";

import { formatDuration } from "@/ui/admin/operations/operations-format";

const cost = (value: number) =>
  value > 0 && value < 0.0001 ? "<US$0.0001" : `US$${value.toFixed(4)}`;

export function CourseRunHeader({
  run,
  active,
}: {
  run?: Run;
  active: boolean;
}) {
  if (!run)
    return (
      <div className="flex items-center gap-2 py-3 text-sm" role="status">
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Starting import...
      </div>
    );
  const state = courseRunState(run, active);
  const segments = courseRunSegments(run);
  const outcomes = [
    { label: "Published", count: segments.published, colour: "bg-primary" },
    { label: "Drafts ready", count: segments.drafts, colour: "bg-primary/50" },
    { label: "To review", count: segments.review, colour: "bg-orange-500" },
    { label: "Failed", count: segments.failed, colour: "bg-destructive" },
    {
      label: "Stopped",
      count: segments.stopped,
      colour: "bg-muted-foreground",
    },
    {
      label: "Other processed",
      count: segments.other,
      colour: "bg-muted-foreground",
    },
  ];
  return (
    <section aria-label="Import progress" className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Badge
          role="status"
          variant={
            state === "Finished"
              ? "primary-light"
              : state === "Paused"
                ? "warning-light"
                : "secondary"
          }
        >
          {state}
        </Badge>
        <span className="tabular-nums">
          {run.imported} of {run.total} imported
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={
          run.kind && run.kind !== "course"
            ? "Records imported"
            : "Courses imported"
        }
        aria-valuemin={0}
        aria-valuemax={run.total || 1}
        aria-valuenow={Math.min(run.total, run.imported)}
        aria-valuetext={`${run.imported} of ${run.total} ${run.kind && run.kind !== "course" ? `${run.kind}s` : "courses"} imported: ${segments.published} published, ${segments.drafts} drafts ready, ${segments.review} need review, ${segments.failed} failed, ${segments.stopped} stopped${segments.other ? `, ${segments.other} other processed` : ""}`}
        className="flex h-2 overflow-hidden rounded-full bg-muted"
      >
        {outcomes.map(
          (outcome) =>
            outcome.count > 0 &&
            outcome.label !== "Stopped" && (
              <span
                key={outcome.label}
                aria-hidden="true"
                className={outcome.colour}
                style={{
                  width: `${run.total ? (outcome.count / run.total) * 100 : 0}%`,
                }}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <ul
          aria-label="Import outcomes"
          className="flex flex-wrap gap-x-4 gap-y-2"
        >
          {outcomes
            .filter(
              (outcome) =>
                outcome.label !== "Other processed" || outcome.count > 0,
            )
            .map((outcome) => (
              <li key={outcome.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${outcome.colour}`}
                />
                <span className="tabular-nums">
                  {outcome.count} {outcome.label.toLowerCase()}
                </span>
              </li>
            ))}
        </ul>
        {run.allow_ai === false ? (
          <span>AI disabled</span>
        ) : (
          <span className="tabular-nums">
            {cost(Number(run.spent_usd))} spent of{" "}
            {cost(Number(run.budget_usd))}
          </span>
        )}
      </div>
      {run.pause_reason && (
        <p role="alert" className="text-sm text-warning">
          {run.pause_reason}
        </p>
      )}
    </section>
  );
}

export function CourseRunProgress({ run }: { run?: Run; active: boolean }) {
  if (!run) return null;
  const costs = courseRunCosts(run);
  const analysis = courseRunAnalysis(run);
  const percent = (value: number | null) =>
    value === null ? "--" : `${value.toFixed(1)}%`;
  const outcomeMetrics = [
    {
      label: "Publication rate",
      value: percent(analysis.publicationRate),
      detail: `${run.published} of ${run.imported} imported ${run.kind && run.kind !== "course" ? `${run.kind}s` : "courses"}`,
    },
    {
      label: "Review rate",
      value: percent(analysis.reviewRate),
      detail: `${run.review} of ${run.imported} imported ${run.kind && run.kind !== "course" ? `${run.kind}s` : "courses"}`,
    },
    {
      label: "Elapsed time",
      value: formatDuration(
        analysis.elapsedSeconds === null
          ? null
          : analysis.elapsedSeconds * 1000,
      ),
      detail: "Includes time between requests and pauses",
    },
    {
      label: "Import rate",
      value:
        analysis.coursesPerMinute === null
          ? "--"
          : `${analysis.coursesPerMinute.toFixed(1)} / min`,
      detail: "Imported records per elapsed minute",
    },
  ];
  return (
    <div className="space-y-6">
      <section
        aria-label="Import analysis"
        className="space-y-4 rounded-lg border p-4"
      >
        <h3 className="text-sm font-medium">Results</h3>
        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {outcomeMetrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {metric.value}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">
                {metric.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        aria-label="Import costs"
        className="space-y-4 rounded-lg border p-4"
      >
        <h3 className="text-sm font-medium">Spending</h3>
        {run.allow_ai === false && (
          <p className="text-sm text-muted-foreground">
            AI was disabled for this import. Ambiguous requirements were kept
            for review.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-6 text-sm lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Actual spend</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {cost(costs.spent)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Budget remaining</dt>
            <dd className="mt-1 text-lg tabular-nums">
              {cost(costs.available)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Average cost per record
            </dt>
            <dd className="mt-1 text-lg tabular-nums">
              {analysis.averageCost === null
                ? "--"
                : cost(analysis.averageCost)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {analysis.settled} records with confirmed costs
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Average cost per paid record
            </dt>
            <dd className="mt-1 text-lg tabular-nums">
              {analysis.paidAverageCost === null
                ? "--"
                : cost(analysis.paidAverageCost)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Per record with an AI charge
            </dd>
          </div>
          {costs.reserved > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">
                Set aside for pending AI requests
              </dt>
              <dd className="mt-1 tabular-nums">{cost(costs.reserved)}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          {run.paid_courses ?? 0}{" "}
          {run.paid_courses === 1 ? "record" : "records"} with AI charges ·{" "}
          {run.free_courses ?? 0} with no AI charge (
          {percent(analysis.noChargeRate)})
        </p>
      </section>
    </div>
  );
}
