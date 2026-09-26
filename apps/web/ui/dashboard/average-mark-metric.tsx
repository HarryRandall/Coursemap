"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import type { AcademicTermPoint } from "@/lib/coursemap/academic-metrics";
import { AcademicMetricCard } from "./academic-metric-card";
import { averageMarkSkeleton } from "./metric-skeletons";
import { brand } from "./grade-colours";

/** Marks from 80 are a high distinction. */
const HIGH_DISTINCTION = 80;
const VISIBLE_COURSES = 4;

/** Each course's mark in one semester, stepping back through past ones. */
export function AverageMarkMetric({
  points,
}: {
  points: readonly AcademicTermPoint[];
}) {
  const semesters = points.filter((point) => point.marks.length > 0);
  const [picked, setPicked] = useState<number | null>(null);
  const last = semesters.length - 1;
  const index = Math.min(picked ?? last, last);
  const semester = semesters[index];
  return (
    <AcademicMetricCard
      empty={
        semester
          ? null
          : { label: "No marks yet", skeleton: averageMarkSkeleton }
      }
      header={
        <>
          <h3 className="flex items-baseline gap-1.5">
            {semester ? (
              <span className="text-xl font-semibold tabular-nums">
                {Math.round(semester.wam)}%
              </span>
            ) : null}
            {semester ? (
              <span className="text-xs text-muted-foreground">Avg. mark</span>
            ) : (
              <span className="text-sm font-semibold">Avg. mark</span>
            )}
          </h3>
          {semester ? (
            <div className="-my-1 flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous semester marks"
                disabled={index === 0}
                onClick={() => setPicked(Math.max(0, index - 1))}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
              <span
                className="text-[10px] text-muted-foreground"
                aria-live="polite"
              >
                {semester.label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next semester marks"
                disabled={index === semesters.length - 1}
                onClick={() =>
                  setPicked(Math.min(semesters.length - 1, index + 1))
                }
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </>
      }
    >
      {semester ? (
        <ul className="flex h-24 flex-col justify-center gap-2">
          {semester.marks.slice(0, VISIBLE_COURSES).map((course) => (
            <li
              key={course.code}
              className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2 text-[10px]"
            >
              <span className="text-muted-foreground">{course.code}</span>
              <div className="relative h-px bg-border" aria-hidden="true">
                <span
                  className="absolute -top-1.5 h-3 border-l border-dashed border-muted-foreground/50"
                  style={{ left: `${HIGH_DISTINCTION}%` }}
                />
                <span
                  className="absolute -top-1 size-2 -translate-x-1/2 rounded-full"
                  style={{
                    left: `${Math.min(100, Math.max(0, course.mark))}%`,
                    background: brand,
                  }}
                />
              </div>
              <span className="text-right tabular-nums">
                {Math.round(course.mark)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </AcademicMetricCard>
  );
}
