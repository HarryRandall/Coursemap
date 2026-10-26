"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { TuitionEstimate } from "@/lib/coursemap/academic-metrics";
import { feeStatusLabel, feeStatusShortLabel } from "@/lib/academic/fee-status";
import { AcademicMetricCard, MetricPager } from "./academic-metric-card";
import { tuitionSkeleton } from "./metric-skeletons";

function money(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-AU")}`;
}

function courseCount(count: number) {
  return `${count} ${count === 1 ? "course" : "courses"}`;
}

function yearCourses(fee: TuitionEstimate["byYear"][number]) {
  return fee.estimatedCourses
    ? `${courseCount(fee.courses)}, ${fee.estimatedCourses} estimated`
    : courseCount(fee.courses);
}

function estimatedCoursesNote(count: number) {
  return `ANU didn't list a fee we could read for ${courseCount(count)}, so ${count === 1 ? "it is" : "they are"} priced from similar courses. These are estimates, not official fees.`;
}

/** Years shown at once; more than this pages with the footer arrows. */
const VISIBLE_YEARS = 3;

/**
 * The estimate split by study year. Each row is a third of the chart's
 * height, so fewer years keep the same row size and sit centred.
 */
export function TuitionMetric({
  tuition,
}: {
  tuition: TuitionEstimate | null;
}) {
  const years = tuition?.byYear ?? [];
  const lastStart = Math.max(0, years.length - VISIBLE_YEARS);
  // Open on the window that begins with this year, when the plan reaches it.
  const thisYear = new Date().getFullYear();
  const current = years.findIndex((fee) => fee.year >= thisYear);
  const [picked, setPicked] = useState<number | null>(null);
  const start = Math.min(picked ?? Math.max(0, current), lastStart);
  const shown = years.slice(start, start + VISIBLE_YEARS);
  const largest = Math.max(1, ...years.map((fee) => fee.amount));
  return (
    <AcademicMetricCard
      title="Est. tuition"
      empty={
        tuition === null
          ? { label: "Fees not published", skeleton: tuitionSkeleton }
          : null
      }
      aside={
        tuition ? (
          <p className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {tuition.estimatedCourses > 0 ? "≈ " : ""}
            {money(tuition.total)}
          </p>
        ) : null
      }
      footer={
        tuition ? (
          <>
            <span
              className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground"
              title={`Priced as ${feeStatusLabel(tuition.feeStatus)}`}
            >
              {feeStatusShortLabel(tuition.feeStatus)}
            </span>
            {tuition.estimatedCourses > 0 ? (
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="min-w-0 cursor-help truncate text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
                  >
                    Includes estimates
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  {estimatedCoursesNote(tuition.estimatedCourses)}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {lastStart > 0 ? (
              <MetricPager
                earlierLabel="Earlier years"
                laterLabel="Later years"
                onEarlier={
                  start > 0
                    ? () => setPicked(Math.max(0, start - 1))
                    : undefined
                }
                onLater={
                  start < lastStart
                    ? () => setPicked(Math.min(lastStart, start + 1))
                    : undefined
                }
              />
            ) : null}
          </>
        ) : null
      }
    >
      <ul
        className="flex h-24 flex-col justify-center gap-1.5"
        aria-live="polite"
      >
        {shown.map((fee) => (
          <Tooltip key={fee.year} delayDuration={100}>
            <TooltipTrigger asChild>
              <li
                tabIndex={0}
                aria-label={`${fee.year}: ${fee.estimatedCourses ? "about " : ""}${money(fee.amount)} across ${yearCourses(fee)}`}
                className="group grid h-7 shrink-0 grid-cols-[2.25rem_1fr_auto] items-center gap-2.5 rounded-md text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-muted-foreground">{fee.year}</span>
                <div className="h-full overflow-hidden rounded-md bg-muted">
                  <div
                    className="enter-grow-across h-full rounded-md bg-primary transition-opacity group-hover:opacity-85"
                    style={{
                      width: `${(fee.amount / largest) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-right font-medium tabular-nums">
                  {fee.estimatedCourses ? "≈ " : ""}
                  {money(fee.amount)}
                </span>
              </li>
            </TooltipTrigger>
            <TooltipContent side="top">{yearCourses(fee)}</TooltipContent>
          </Tooltip>
        ))}
      </ul>
    </AcademicMetricCard>
  );
}
