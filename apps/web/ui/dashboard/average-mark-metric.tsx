"use client";

import { useState } from "react";
import type { AcademicTermPoint } from "@/lib/coursemap/academic-metrics";
import { AcademicMetricCard, MetricPager } from "./academic-metric-card";
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
  const semesters = points.flatMap((point) =>
    point.wam !== null && point.marks.length > 0
      ? [{ ...point, wam: point.wam }]
      : [],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const last = semesters.length - 1;
  const index = Math.min(picked ?? last, last);
  const semester = semesters[index];
  return (
    <AcademicMetricCard
      title="Avg. mark"
      empty={
        semester
          ? null
          : { label: "No marks yet", skeleton: averageMarkSkeleton }
      }
      aside={
        semester ? (
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {Math.round(semester.wam)}%
          </span>
        ) : null
      }
      footer={
        semester ? (
          <MetricPager
            label={semester.label}
            earlierLabel="Previous semester marks"
            laterLabel="Next semester marks"
            onEarlier={
              index > 0 ? () => setPicked(Math.max(0, index - 1)) : undefined
            }
            onLater={
              index < last
                ? () => setPicked(Math.min(last, index + 1))
                : undefined
            }
          />
        ) : null
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
