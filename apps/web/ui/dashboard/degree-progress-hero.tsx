"use client";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@coursemap/ui/primitives/tooltip";

import { Card, CardContent } from "@coursemap/ui/primitives/card";

import { cn } from "@/lib/cn";
import { ProgressRing } from "@/ui/common/progress-ring";
import type { DegreeUnitProgress } from "@/lib/planner";

type Segment = {
  id: string;
  label: string;
  units: number;
  className: string;
  dotClassName: string;
};

/** Total degree progress, split by course status. */
export function DegreeProgressHero({
  progress,
  unitTarget,
  enrolledUnits,
}: {
  progress: DegreeUnitProgress;
  unitTarget: number | null;
  enrolledUnits: number;
}) {
  const plannedOnly = Math.max(0, progress.planned - enrolledUnits);
  const segments: Segment[] = [
    {
      id: "completed",
      label: "Completed",
      units: progress.completed,
      className: "bg-emerald-500",
      dotClassName: "bg-emerald-500",
    },
    {
      id: "enrolled",
      label: "Enrolled",
      units: enrolledUnits,
      className: "bg-primary",
      dotClassName: "bg-primary",
    },
    {
      id: "planned",
      label: "Planned",
      units: plannedOnly,
      className: "bg-primary/35",
      dotClassName: "bg-primary/35",
    },
    {
      id: "unallocated",
      label: "Unallocated",
      units: progress.remaining,
      className: "bg-muted-foreground/20",
      dotClassName: "bg-muted-foreground/30",
    },
  ];
  const total = unitTarget ?? progress.mapped;

  return (
    <Card className="h-full py-0">
      <CardContent className="flex h-full flex-row items-center gap-6 p-5">
        {total > 0 && (
          <ProgressRing
            completed={progress.completed}
            planned={progress.planned}
            target={total}
            size="large"
          >
            {progress.percent}%
          </ProgressRing>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
          <p className="text-3xl font-semibold tracking-tight">
            {progress.completed}
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {total} units completed
            </span>
          </p>

          <div
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
            role="group"
            aria-label={segments
              .map((segment) => `${segment.label}: ${segment.units} units`)
              .join(", ")}
          >
            {segments
              .filter((segment) => segment.units > 0)
              .map((segment) => (
                <Tooltip key={segment.id}>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      aria-label={`${segment.label}: ${segment.units} units`}
                      style={{ flex: segment.units }}
                      className={cn(
                        "h-full first:rounded-l-full last:rounded-r-full",
                        segment.className,
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{`${segment.label}: ${segment.units} units`}</TooltipContent>
                </Tooltip>
              ))}
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-2">
            {segments.map((segment) => (
              <div key={segment.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", segment.dotClassName)}
                />
                <dt className="text-xs text-muted-foreground">
                  {segment.label}
                </dt>
                <dd className="text-xs font-semibold tabular-nums">
                  {segment.units} units
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
