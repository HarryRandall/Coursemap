"use client";
import type { ReactNode } from "react";
import { CalendarCheck2, Layers3 } from "lucide-react";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import { Hint } from "@/ui/common/hint";
import { cn } from "@/lib/cn";
import { TrendChart, DonutChart, chartColours } from "./metric-charts";
import type { DashboardTermPoint } from "@/lib/coursemap/dashboard-series";
import type { RequirementBucketProgress } from "@/lib/coursemap/requirement-progress";
import { STANDARD_TERM_UNITS, type DegreeUnitProgress } from "@/lib/planner";
import { MiniBars, Ring, TickMeter } from "@/ui/dashboard/metric-visuals";
import { TrendBars } from "@/ui/dashboard/trend-bars";
import { GradeBars } from "@/ui/dashboard/grade-bars";
import { MetricEmpty } from "@/ui/dashboard/metric-empty";
import { formatMark } from "@/lib/academic/metrics";
import type {
  AcademicSummary,
  AcademicTermPoint,
  GradeTally,
  TuitionEstimate,
} from "@/lib/coursemap/academic-metrics";

export type MetricId =
  | "load"
  | "coverage"
  | "readiness"
  | "remaining"
  | "semester-bars"
  | "completion-ring"
  | "unit-mix"
  | "progress-line"
  | "requirements"
  | "next-term"
  | "load-balance"
  | "finish"
  | "wam"
  | "gpa"
  | "tuition"
  | "mark-trend"
  | "grade-mix";
export const METRIC_OPTIONS: Record<
  MetricId,
  { title: string; blurb: string }
> = {
  load: {
    title: "Current semester",
    blurb: "Units scheduled this semester against the standard load.",
  },
  coverage: {
    title: "Planning coverage",
    blurb: "How much of the degree already has a place in the plan.",
  },
  readiness: {
    title: "Next semester readiness",
    blurb: "Which upcoming courses still need a prerequisite check.",
  },
  remaining: {
    title: "Room in your plan",
    blurb: "Units without a course yet, in standard course equivalents.",
  },
  "semester-bars": {
    title: "Upcoming semester load",
    blurb: "Units per semester across the next few semesters.",
  },
  "completion-ring": {
    title: "Degree completed",
    blurb: "Completed units as a share of the whole degree.",
  },
  "unit-mix": {
    title: "Your unit mix",
    blurb: "Completed, enrolled, planned and free units side by side.",
  },
  "progress-line": {
    title: "Planned progress",
    blurb: "Cumulative units over time, including future plans.",
  },
  requirements: {
    title: "Requirements progress",
    blurb: "Completed units in each top-level degree group.",
  },
  "next-term": {
    title: "Next semester courses",
    blurb: "The course codes coming up next semester.",
  },
  "load-balance": {
    title: "Load balance",
    blurb: "How evenly the upcoming semesters are loaded.",
  },
  finish: {
    title: "Last scheduled term",
    blurb: "When the current plan runs out of scheduled semesters.",
  },
  wam: {
    title: "Weighted average mark",
    blurb: "Your WAM across every marked course, weighted by units.",
  },
  gpa: {
    title: "Grade point average",
    blurb: "Your GPA on the ANU seven-point scale.",
  },
  tuition: {
    title: "Est. tuition",
    blurb: "Published fees summed across the courses in your plan.",
  },
  "mark-trend": {
    title: "WAM by semester",
    blurb: "How your weighted average has moved each teaching period.",
  },
  "grade-mix": {
    title: "Grade distribution",
    blurb: "How your completed courses fall across the grade bands.",
  },
};

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */
export type MetricCourse = { code: string; units: number; ready: boolean };
export type MetricInputs = {
  unitTarget: number | null;
  progress: DegreeUnitProgress;
  enrolledUnits: number;
  cumulative: readonly DashboardTermPoint[];
  buckets: readonly RequirementBucketProgress[];
  /** The semester in focus right now (current, or the next one with courses). */
  focusTermLabel: string | null;
  focusCourses: readonly MetricCourse[];
  /** The next upcoming semester after the focus one that has courses. */
  nextTermLabel: string | null;
  nextCourses: readonly MetricCourse[];
  /** Scheduled terms from the focus semester onwards. */
  upcoming: readonly DashboardTermPoint[];
  /** e.g. "Nov 2028" — the end of the last semester containing courses. */
  finishLabel: string | null;
  /** Headline mark figures; all null until a result is recorded. */
  academic: AcademicSummary;
  /** One point per teaching period that has marks, oldest first. */
  markTrend: readonly AcademicTermPoint[];
  grades: readonly GradeTally[];
  /** Null when no course in the plan has a published fee. */
  tuition: TuitionEstimate | null;
};

/* ------------------------------------------------------------------ */
/* Small visuals                                                       */
/* ------------------------------------------------------------------ */
export type MetricView = {
  id: MetricId;
  title: string;
  value: string;
  unit: string;
  note: string;
  /** Rendered beside the big value (rings). */
  aside?: ReactNode;
  /** Rendered between the value and the note. */
  body?: ReactNode;
};
function courseWord(count: number) {
  return count === 1 ? "course" : "courses";
}
function semesterWord(count: number) {
  return count === 1 ? "semester" : "semesters";
}
export function buildMetricViews(
  inputs: MetricInputs,
): Record<MetricId, MetricView> {
  const {
    unitTarget,
    progress,
    enrolledUnits,
    cumulative,
    buckets,
    focusTermLabel,
    focusCourses,
    nextTermLabel,
    nextCourses,
    upcoming,
    finishLabel,
    academic,
    markTrend,
    grades,
    tuition,
  } = inputs;

  const focusUnits = focusCourses.reduce((total, c) => total + c.units, 0);
  const nextUnits = nextCourses.reduce((total, c) => total + c.units, 0);
  const readyCount = nextCourses.filter((c) => c.ready).length;
  const needsCheck = nextCourses.length - readyCount;
  const freeSemesters = Math.max(
    1,
    Math.round(progress.remaining / STANDARD_TERM_UNITS),
  );
  const nearTerms = upcoming.slice(0, 4);
  const fullTerms = nearTerms.filter(
    (term) => term.units === STANDARD_TERM_UNITS,
  ).length;
  const lightest = nearTerms.reduce(
    (lowest, term) => (term.units < lowest.units ? term : lowest),
    nearTerms[0] ?? { label: "", units: 0 },
  );
  const lastCumulative = cumulative.at(-1);
  const plannedOnly = Math.max(0, progress.planned - enrolledUnits);

  return {
    load: {
      id: "load",
      title: METRIC_OPTIONS.load.title,
      value: String(focusUnits),
      unit: `/ ${STANDARD_TERM_UNITS} units`,
      note:
        focusCourses.length === 0
          ? "No courses scheduled yet"
          : `${focusCourses.length} ${courseWord(focusCourses.length)} · ${
              focusUnits > STANDARD_TERM_UNITS
                ? "overloaded"
                : focusUnits === STANDARD_TERM_UNITS
                  ? "standard load"
                  : "below standard load"
            }${focusTermLabel ? ` · ${focusTermLabel}` : ""}`,
      aside: (
        <DonutChart
          half
          segments={[
            {
              name: "Scheduled units",
              value: focusUnits,
              fill: chartColours.blue,
            },
            {
              name: "Available units",
              value: Math.max(0, STANDARD_TERM_UNITS - focusUnits),
              fill: chartColours.muted,
            },
          ]}
        />
      ),
    },
    coverage: {
      id: "coverage",
      title: METRIC_OPTIONS.coverage.title,
      value:
        unitTarget && unitTarget > 0
          ? `${Math.round((progress.mapped / unitTarget) * 100)}%`
          : `${progress.mapped}`,
      unit: unitTarget && unitTarget > 0 ? "allocated" : "units allocated",
      note:
        unitTarget && unitTarget > 0
          ? `${progress.mapped} of ${unitTarget} units have a place`
          : `${progress.completed} completed · ${progress.planned} planned`,
      aside: unitTarget ? (
        <DonutChart
          segments={[
            {
              name: "Allocated units",
              value: progress.mapped,
              fill: chartColours.violet,
            },
            {
              name: "Unallocated units",
              value: Math.max(0, unitTarget - progress.mapped),
              fill: chartColours.muted,
            },
          ]}
        />
      ) : undefined,
    },
    readiness: {
      id: "readiness",
      title: METRIC_OPTIONS.readiness.title,
      value: nextCourses.length ? String(readyCount) : "Not scheduled",
      unit: nextCourses.length ? `/ ${nextCourses.length} ready` : "",
      aside: (
        <DonutChart
          half
          segments={[
            {
              name: "Ready courses",
              value: readyCount,
              fill: chartColours.green,
            },
            {
              name: "Need checking",
              value: needsCheck,
              fill: chartColours.amber,
            },
          ]}
        />
      ),
      note:
        nextCourses.length === 0
          ? "Nothing scheduled next semester yet"
          : needsCheck > 0
            ? `${needsCheck} ${courseWord(needsCheck)} need${needsCheck === 1 ? "s" : ""} a prerequisite check`
            : "Everything is ready to enrol",
      body: nextCourses.length > 0 && (
        <div className="flex gap-1.5">
          {nextCourses.slice(0, 6).map((course) => (
            <Hint
              key={course.code}
              label={`${course.code} ${course.ready ? "ready" : "needs a check"}`}
            >
              <span
                className={cn(
                  "flex h-6 flex-1 items-center justify-center rounded-md text-[11px] font-bold",
                  course.ready
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {course.ready ? "✓" : "!"}
              </span>
            </Hint>
          ))}
        </div>
      ),
    },
    remaining: {
      id: "remaining",
      title: METRIC_OPTIONS.remaining.title,
      value: unitTarget === null ? "Not available" : String(progress.remaining),
      unit: "units free",
      note:
        unitTarget === null
          ? `${progress.mapped} units mapped`
          : progress.remaining === 0
            ? "Every unit of the degree has a course"
            : `About ${freeSemesters} more ${semesterWord(freeSemesters)} at standard load`,
      body: unitTarget ? (
        <TickMeter
          percent={(progress.remaining / unitTarget) * 100}
          label={`${progress.remaining} free units out of ${unitTarget}`}
        />
      ) : undefined,
    },
    "semester-bars": {
      id: "semester-bars",
      title: METRIC_OPTIONS["semester-bars"].title,
      value: String(nearTerms[0]?.units ?? 0),
      unit: "units",
      note:
        nearTerms.length > 0
          ? `${nearTerms[0]?.label} onwards · standard load 24 units`
          : "No upcoming semesters in the plan",
      body: nearTerms.length > 0 && (
        <MiniBars
          points={nearTerms.map((term) => ({
            label: term.label,
            units: term.units,
          }))}
          label={nearTerms
            .map((term) => `${term.label}: ${term.units} units`)
            .join(", ")}
        />
      ),
    },
    "completion-ring": {
      id: "completion-ring",
      title: METRIC_OPTIONS["completion-ring"].title,
      value: unitTarget ? `${progress.percent}%` : `${progress.completed}`,
      unit: unitTarget ? "complete" : "units completed",
      note: unitTarget
        ? `${progress.completed} of ${unitTarget} units completed`
        : `${progress.completed} completed · ${progress.planned} planned`,
      aside: unitTarget ? (
        <Ring
          percent={progress.percent}
          label={`${progress.completed} of ${unitTarget} units completed`}
        />
      ) : undefined,
    },
    "unit-mix": {
      id: "unit-mix",
      title: METRIC_OPTIONS["unit-mix"].title,
      value: String(unitTarget ?? progress.mapped),
      unit: "degree units",
      note: `${progress.completed} completed · ${enrolledUnits} enrolled · ${plannedOnly} planned · ${progress.remaining} free`,
      aside: (
        <DonutChart
          segments={[
            {
              name: "Completed",
              value: progress.completed,
              fill: chartColours.green,
            },
            { name: "Enrolled", value: enrolledUnits, fill: chartColours.blue },
            { name: "Planned", value: plannedOnly, fill: chartColours.violet },
            {
              name: "Unallocated",
              value: progress.remaining,
              fill: chartColours.muted,
            },
          ]}
        />
      ),
    },
    "progress-line": {
      id: "progress-line",
      title: METRIC_OPTIONS["progress-line"].title,
      value: String(lastCumulative?.units ?? 0),
      unit: lastCumulative ? `units by end of ${lastCumulative.year}` : "units",
      note: "Cumulative units · includes future plans",
      body: (
        <TrendChart
          points={cumulative.map((point) => ({
            label: point.label,
            units: point.units,
          }))}
          colour={chartColours.rose}
        />
      ),
    },
    requirements: {
      id: "requirements",
      title: METRIC_OPTIONS.requirements.title,
      value: String(buckets.length),
      unit: buckets.length === 1 ? "degree group" : "degree groups",
      note:
        buckets.length === 0
          ? "No requirement progress to show"
          : "Completed units in each applicable group",
      body: buckets.length > 0 && (
        <div className="flex flex-col gap-1">
          {buckets.slice(0, 2).map((bucket) => {
            const percent = bucket.targetUnits
              ? Math.min(
                  100,
                  (bucket.completedUnits / bucket.targetUnits) * 100,
                )
              : 0;
            return (
              <div key={bucket.key} className="flex items-center gap-2">
                <small className="w-24 truncate text-[10px] text-muted-foreground">
                  {bucket.title}
                </small>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-current/15">
                  <span
                    className="block h-full rounded-full bg-current"
                    style={{ width: `${percent}%` }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      ),
    },
    "next-term": {
      id: "next-term",
      title: METRIC_OPTIONS["next-term"].title,
      aside: <Layers3 className="size-6 opacity-50" aria-hidden="true" />,
      value: String(nextCourses.length),
      unit: `${courseWord(nextCourses.length)} · ${nextUnits} units`,
      note: nextTermLabel ?? "No upcoming semester scheduled",
      body: nextCourses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {nextCourses.slice(0, 6).map((course) => (
            <span
              key={course.code}
              className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] font-semibold"
            >
              {course.code}
            </span>
          ))}
        </div>
      ),
    },
    "load-balance": {
      id: "load-balance",
      title: METRIC_OPTIONS["load-balance"].title,
      value: String(fullTerms),
      unit: `/ ${nearTerms.length} ${semesterWord(nearTerms.length)} at ${STANDARD_TERM_UNITS} units`,
      note:
        nearTerms.length === 0
          ? "No upcoming semesters in the plan"
          : lightest.units < STANDARD_TERM_UNITS
            ? `${STANDARD_TERM_UNITS - lightest.units} units below standard in ${lightest.label}`
            : "Every upcoming semester carries a standard load",
      body: (
        <TrendChart
          points={nearTerms.map((term) => ({
            label: term.label,
            units: term.units,
          }))}
          kind="line"
          colour={chartColours.amber}
        />
      ),
    },
    finish: {
      id: "finish",
      title: "Last scheduled term",
      value: finishLabel ?? "Not scheduled",
      unit: "",
      note:
        nearTerms.length > 0
          ? `${nearTerms.length} upcoming ${semesterWord(nearTerms.length)} · ${progress.remaining} units still to allocate`
          : "Add courses to project a finish date",
      aside: (
        <CalendarCheck2 className="size-6 opacity-50" aria-hidden="true" />
      ),
    },
    wam: {
      id: "wam",
      title: METRIC_OPTIONS.wam.title,
      value: academic.wam === null ? "No marks yet" : formatMark(academic.wam),
      unit: academic.wam === null ? "" : (academic.band ?? ""),
      note:
        academic.wam === null
          ? ""
          : `${academic.markedCourses} marked ${courseWord(academic.markedCourses)} · ${academic.markedUnits} units${
              academic.delta === null
                ? ""
                : ` · ${academic.delta >= 0 ? "up" : "down"} ${formatMark(Math.abs(academic.delta))} on last semester`
            }`,
      body:
        academic.wam === null ? (
          <MetricEmpty />
        ) : markTrend.length > 1 ? (
          <TrendBars
            points={markTrend.map((point) => ({
              label: point.label,
              value: point.wam,
            }))}
            height={56}
            format={formatMark}
          />
        ) : undefined,
    },
    gpa: {
      id: "gpa",
      title: METRIC_OPTIONS.gpa.title,
      value: academic.gpa === null ? "No marks yet" : formatMark(academic.gpa),
      unit: academic.gpa === null ? "" : "/ 7.0",
      note:
        academic.gpa === null
          ? ""
          : `Across ${academic.markedUnits} graded units`,
      body: academic.gpa === null ? <MetricEmpty /> : undefined,
    },
    tuition: {
      id: "tuition",
      title: METRIC_OPTIONS.tuition.title,
      value:
        tuition === null
          ? "Not published"
          : tuition.total.toLocaleString("en-AU", {
              style: "currency",
              currency: tuition.currency,
              maximumFractionDigits: 0,
            }),
      unit: "",
      note:
        tuition === null
          ? ""
          : `${tuition.pricedCourses} of ${tuition.plannedCourses} ${courseWord(tuition.plannedCourses)} priced${
              tuition.feeYear ? ` · ${tuition.feeYear} fees` : ""
            }`,
      body: tuition === null ? <MetricEmpty /> : undefined,
    },
    "mark-trend": {
      id: "mark-trend",
      title: METRIC_OPTIONS["mark-trend"].title,
      value:
        markTrend.length > 0
          ? formatMark(markTrend[markTrend.length - 1]!.wam)
          : "No marks yet",
      unit: markTrend.length > 0 ? "latest" : "",
      note:
        markTrend.length > 0
          ? `${markTrend.length} graded ${semesterWord(markTrend.length)}`
          : "",
      body:
        markTrend.length > 0 ? (
          <TrendBars
            points={markTrend.map((point) => ({
              label: point.label,
              value: point.wam,
            }))}
            format={formatMark}
          />
        ) : (
          <MetricEmpty />
        ),
    },
    "grade-mix": {
      id: "grade-mix",
      title: METRIC_OPTIONS["grade-mix"].title,
      value:
        academic.markedCourses > 0
          ? String(academic.markedCourses)
          : "No marks yet",
      unit:
        academic.markedCourses > 0
          ? `completed ${courseWord(academic.markedCourses)}`
          : "",
      note: "",
      body:
        academic.markedCourses > 0 ? (
          <GradeBars points={grades} />
        ) : (
          <MetricEmpty />
        ),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
const metricTones: Record<MetricId, string> = {
  load: "text-sky-600 dark:text-sky-400",
  coverage: "text-violet-600 dark:text-violet-400",
  readiness: "text-amber-600 dark:text-amber-400",
  remaining: "text-amber-600 dark:text-amber-400",
  "semester-bars": "text-sky-600 dark:text-sky-400",
  "completion-ring": "text-emerald-600 dark:text-emerald-400",
  "unit-mix": "text-violet-600 dark:text-violet-400",
  "progress-line": "text-rose-600 dark:text-rose-400",
  requirements: "text-cyan-600 dark:text-cyan-400",
  "next-term": "text-sky-600 dark:text-sky-400",
  "load-balance": "text-amber-600 dark:text-amber-400",
  finish: "text-rose-600 dark:text-rose-400",
  wam: "text-emerald-600 dark:text-emerald-400",
  gpa: "text-emerald-600 dark:text-emerald-400",
  tuition: "text-amber-600 dark:text-amber-400",
  "mark-trend": "text-violet-600 dark:text-violet-400",
  "grade-mix": "text-violet-600 dark:text-violet-400",
};
export function MetricCardView({
  view,
  compact = false,
}: {
  view: MetricView;
  compact?: boolean;
}) {
  if (compact)
    return (
      <Card className="relative overflow-visible py-0 focus-within:z-10 hover:z-10">
        <CardContent className="relative flex h-32 flex-col justify-between p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {view.title}
          </p>
          <p className="max-w-[55%] text-xl font-semibold tabular-nums">
            {view.value}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {view.unit}
            </span>
          </p>
          <div className="absolute top-6 right-4 flex h-20 w-2/5 items-center justify-end">
            {view.aside ? (
              view.aside
            ) : (
              <div className="w-full">{view.body}</div>
            )}
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {view.note}
          </p>
        </CardContent>
      </Card>
    );
  return (
    <Card className="relative overflow-visible py-0 focus-within:z-10 hover:z-10">
      <CardContent
        className={cn(
          "flex h-full min-h-32 flex-col gap-1.5 p-4",
          metricTones[view.id],
        )}
      >
        <p className="text-xs font-medium text-muted-foreground">
          {view.title}
        </p>
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
          <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
            {view.value}{" "}
            {view.unit && (
              <span className="text-xs font-normal tracking-normal text-muted-foreground">
                {view.unit}
              </span>
            )}
          </p>
          {view.aside}
        </div>
        {view.body}
        <p className="mt-auto text-[11px] leading-4 text-muted-foreground">
          {view.note}
        </p>
      </CardContent>
    </Card>
  );
}
