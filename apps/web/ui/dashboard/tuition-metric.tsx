"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { TuitionEstimate } from "@/lib/coursemap/academic-metrics";
import { AcademicMetricCard } from "./academic-metric-card";
import { tuitionSkeleton } from "./metric-skeletons";

function money(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-AU")}`;
}

/** Years shown at once; more than this pages with the header arrows. */
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
      empty={
        tuition === null
          ? { label: "Fees not published", skeleton: tuitionSkeleton }
          : null
      }
      header={
        <>
          {tuition ? (
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {money(tuition.total)}
            </p>
          ) : null}
          <div className="flex shrink-0 items-center gap-0.5">
            <h3
              className={
                tuition
                  ? "text-xs font-medium text-muted-foreground"
                  : "text-sm font-semibold"
              }
            >
              Est. tuition
            </h3>
            {lastStart > 0 ? (
              <span className="-my-1 ml-1 flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Earlier years"
                  disabled={start === 0}
                  onClick={() => setPicked(Math.max(0, start - 1))}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Later years"
                  disabled={start === lastStart}
                  onClick={() => setPicked(Math.min(lastStart, start + 1))}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </span>
            ) : null}
          </div>
        </>
      }
    >
      <ul className="flex h-24 flex-col justify-center gap-1.5" aria-live="polite">
        {shown.map((fee) => (
          <Tooltip key={fee.year} delayDuration={100}>
            <TooltipTrigger asChild>
              <li
                tabIndex={0}
                aria-label={`${fee.year}: ${money(fee.amount)} across ${fee.courses} ${fee.courses === 1 ? "course" : "courses"}`}
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
                  {money(fee.amount)}
                </span>
              </li>
            </TooltipTrigger>
            <TooltipContent side="top">
              {fee.courses} {fee.courses === 1 ? "course" : "courses"}
            </TooltipContent>
          </Tooltip>
        ))}
      </ul>
    </AcademicMetricCard>
  );
}
