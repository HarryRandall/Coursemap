"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import type { DashboardTermPoint } from "@/lib/coursemap/dashboard-series";
import { STANDARD_TERM_UNITS } from "@/lib/planner";
import { AcademicMetricCard } from "./academic-metric-card";
import { coverageSkeleton } from "./metric-skeletons";

/** A full-time study year: two standard semesters. */
const YEAR_UNITS = STANDARD_TERM_UNITS * 2;

/**
 * How much of each study year has a place in the plan, against a full-time
 * year, split into completed and still-to-come units.
 */
export function CoverageMetric({
  termLoads,
  unitTarget,
  mapped,
}: {
  termLoads: readonly DashboardTermPoint[];
  unitTarget: number | null;
  mapped: number;
}) {
  const years = [
    ...termLoads
      .reduce((all, load) => {
        const year = all.get(load.year) ?? { completed: 0, planned: 0 };
        all.set(load.year, {
          completed: year.completed + load.completed,
          planned: year.planned + load.planned,
        });
        return all;
      }, new Map<number, { completed: number; planned: number }>())
      .entries(),
  ].map(([year, units]) => ({ year, ...units }));
  const ceiling = Math.max(
    YEAR_UNITS,
    ...years.map((year) => year.completed + year.planned),
  );
  const percent =
    unitTarget && unitTarget > 0
      ? Math.min(100, Math.round((mapped / unitTarget) * 100))
      : null;
  return (
    <AcademicMetricCard
      empty={
        mapped === 0
          ? { label: "Nothing placed yet", skeleton: coverageSkeleton }
          : null
      }
      header={
        <>
          <h3 className="text-sm font-semibold">Planning coverage</h3>
          {percent !== null && mapped > 0 ? (
            <span className="text-sm font-semibold tabular-nums">
              {percent}%
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                placed
              </span>
            </span>
          ) : null}
        </>
      }
    >
      <div className="flex h-24 flex-col">
        <ul className="relative flex flex-1 items-end justify-around gap-3 border-b border-dashed border-border">
          {years.map((year) => {
            const placed = year.completed + year.planned;
            return (
              <Tooltip key={year.year} delayDuration={100}>
                <TooltipTrigger asChild>
                  <li
                    tabIndex={0}
                    aria-label={`${year.year}: ${placed} of ${YEAR_UNITS} units placed`}
                    className="flex h-full w-full max-w-10 flex-col justify-end outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      className="enter-grow-up flex flex-col overflow-hidden rounded-t-md bg-muted transition-opacity hover:opacity-85"
                      style={{ height: `${(YEAR_UNITS / ceiling) * 100}%` }}
                    >
                      <span className="flex-1" />
                      <span
                        className="bg-primary/50"
                        style={{
                          height: `${(year.planned / YEAR_UNITS) * 100}%`,
                        }}
                      />
                      <span
                        className="bg-success"
                        style={{
                          height: `${(year.completed / YEAR_UNITS) * 100}%`,
                        }}
                      />
                    </div>
                  </li>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {[
                    year.completed ? `${year.completed} completed` : null,
                    year.planned ? `${year.planned} planned` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Nothing placed"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ul>
        <div className="flex h-5 items-end justify-around gap-3 text-[10px] text-muted-foreground">
          {years.map((year) => (
            <span key={year.year} className="w-full max-w-10 text-center">
              {year.year}
            </span>
          ))}
        </div>
      </div>
    </AcademicMetricCard>
  );
}
