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
  // An empty short session is not a light load, so it is left out.
  const terms = upcoming
    .filter((term) => term.isSemester || term.units > 0)
    .slice(0, VISIBLE_TERMS);
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
        <ul className="relative flex flex-1 gap-2">
          {/* The rule sits over the bar area only, above the 20px labels. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
            style={{
              bottom: `calc(20px + (100% - 20px) * ${STANDARD_TERM_UNITS / ceiling})`,
            }}
          />
          {terms.map((term) => (
            <Tooltip key={term.id} delayDuration={100}>
              <TooltipTrigger asChild>
                <li
                  tabIndex={0}
                  aria-label={`${term.label}: ${term.units} units`}
                  className="flex h-full min-w-0 flex-1 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex w-full max-w-8 flex-1 flex-col justify-end border-b border-border">
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
                  </span>
                  <span
                    aria-hidden="true"
                    className="block h-5 w-full truncate pt-1.5 text-center text-[10px] leading-none text-muted-foreground"
                  >
                    {term.label}
                  </span>
                </li>
              </TooltipTrigger>
              <TooltipContent side="top">
                {term.units} units
                {term.units > STANDARD_TERM_UNITS ? " · overload" : ""}
              </TooltipContent>
            </Tooltip>
          ))}
        </ul>
      </div>
    </AcademicMetricCard>
  );
}
