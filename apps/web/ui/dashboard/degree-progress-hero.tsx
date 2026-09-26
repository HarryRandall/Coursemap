"use client";
import { useState } from "react";

import { Card, CardContent } from "@coursemap/ui/primitives/card";

import { cn } from "@/lib/cn";
import { SemesterProgressRings } from "@/ui/common/semester-progress-rings";
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
      className: "bg-success",
      dotClassName: "bg-success",
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
  // The status under the pointer, so the bar and legend highlight together.
  const [active, setActive] = useState<string | null>(null);
  const dim = (id: string) => active !== null && active !== id;

  return (
    <Card className="h-full py-0">
      <CardContent className="flex h-full flex-row items-center gap-6 p-5">
        {total > 0 && (
          <SemesterProgressRings
            completed={progress.completed}
            enrolled={enrolledUnits}
            planned={plannedOnly}
            target={total}
          >
            {progress.percent}%
          </SemesterProgressRings>
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
            className="enter-grow-across flex h-5 w-full items-center gap-0.5"
            onPointerLeave={() => setActive(null)}
            role="group"
            aria-label={segments
              .map((segment) => `${segment.label}: ${segment.units} units`)
              .join(", ")}
          >
            {segments
              .filter((segment) => segment.units > 0)
              .map((segment) => (
                <span
                  key={segment.id}
                  tabIndex={0}
                  aria-label={`${segment.label}: ${segment.units} units`}
                  style={{ flex: segment.units }}
                  onPointerEnter={() => setActive(segment.id)}
                  onFocus={() => setActive(segment.id)}
                  onBlur={() => setActive(null)}
                  className={cn(
                    // The hovered part grows taller and the rest dim.
                    "h-2.5 cursor-default transition-[height,opacity,border-radius] duration-200 ease-out outline-none first:rounded-l-full last:rounded-r-full focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    active === segment.id && "h-5 rounded-md",
                    dim(segment.id) && "opacity-40",
                    segment.className,
                  )}
                />
              ))}
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-2">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className={cn(
                  "flex items-center gap-2 transition-opacity duration-200 motion-reduce:transition-none",
                  dim(segment.id) && "opacity-40",
                )}
              >
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
