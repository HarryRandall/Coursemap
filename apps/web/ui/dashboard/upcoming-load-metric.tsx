"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { DashboardTermPoint } from "@/lib/coursemap/dashboard-series";
import { cn } from "@/lib/cn";
import { STANDARD_TERM_UNITS } from "@/lib/planner";
import { AcademicMetricCard } from "./academic-metric-card";
import { upcomingLoadSkeleton } from "./metric-skeletons";

const VISIBLE_TERMS = 6;

/**
 * Units in each coming semester against the standard 24-unit load, drawn as
 * a dashed line. Overloads stand out in amber and light semesters are paler.
 */
export function UpcomingLoadMetric({
  upcoming,
}: {
  upcoming: readonly DashboardTermPoint[];
}) {
  const terms = upcoming.slice(0, VISIBLE_TERMS);
  const ceiling = Math.max(
    STANDARD_TERM_UNITS * 1.25,
    ...terms.map((term) => term.units),
  );
  const next = terms[0];
  return (
    <AcademicMetricCard
      empty={
        terms.every((term) => term.units === 0)
          ? { label: "No semesters planned", skeleton: upcomingLoadSkeleton }
          : null
      }
      header={
        <>
          <h3 className="text-sm font-semibold">Upcoming load</h3>
          {next ? (
            <span className="text-sm font-semibold tabular-nums">
              {next.units}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                units {next.label}
              </span>
            </span>
          ) : null}
        </>
      }
    >
      <div className="flex h-24 flex-col">
        <ul className="relative flex flex-1 items-end justify-around gap-2 border-b border-border">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
            style={{ bottom: `${(STANDARD_TERM_UNITS / ceiling) * 100}%` }}
          />
          {terms.map((term) => (
            <Tooltip key={term.id} delayDuration={100}>
              <TooltipTrigger asChild>
                <li
                  tabIndex={0}
                  aria-label={`${term.label}: ${term.units} units`}
                  className="flex h-full w-full max-w-8 flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "enter-grow-up rounded-t-md transition-opacity hover:opacity-85",
                      term.units > STANDARD_TERM_UNITS
                        ? "bg-amber-400"
                        : term.units === STANDARD_TERM_UNITS
                          ? "bg-primary"
                          : "bg-primary/50",
                    )}
                    style={{ height: `${(term.units / ceiling) * 100}%` }}
                  />
                </li>
              </TooltipTrigger>
              <TooltipContent side="top">
                {term.units} units
                {term.units > STANDARD_TERM_UNITS ? " · overload" : ""}
              </TooltipContent>
            </Tooltip>
          ))}
        </ul>
        <div className="flex h-5 items-end justify-around gap-2 text-[10px] text-muted-foreground">
          {terms.map((term) => (
            <span
              key={term.id}
              className="w-full max-w-8 text-center whitespace-nowrap"
            >
              {term.label}
            </span>
          ))}
        </div>
      </div>
    </AcademicMetricCard>
  );
}
