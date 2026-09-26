"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AcademicTermPoint } from "@/lib/coursemap/academic-metrics";
import { ChartTip } from "./chart-tip";
import { AcademicMetricCard } from "./academic-metric-card";
import { gpaSkeleton } from "./metric-skeletons";
import { brand } from "./grade-colours";

const LINE = brand;

export function GpaMetric({
  gpa,
  points,
}: {
  gpa: number | null;
  points: readonly AcademicTermPoint[];
}) {
  const series = points.flatMap((point) =>
    point.gpa === null ? [] : [{ term: point.label, value: point.gpa }],
  );
  return (
    <AcademicMetricCard
      empty={
        gpa === null ? { label: "No grades yet", skeleton: gpaSkeleton } : null
      }
      header={
        <>
          <h3 className="text-sm font-semibold">GPA</h3>
          {gpa !== null ? (
            <span className="text-sm font-semibold tabular-nums">
              {gpa.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / 7
              </span>
            </span>
          ) : null}
        </>
      }
    >
      <div
        className="enter-chart-line h-24"
        role="img"
        aria-label={`GPA by semester: ${series
          .map((point) => `${point.term} ${point.value.toFixed(1)}`)
          .join(", ")}`}
      >
        <ResponsiveContainer
          width="100%"
          height={76}
          initialDimension={{ width: 240, height: 76 }}
        >
          <AreaChart
            data={series}
            margin={{ top: 6, right: 3, bottom: 0, left: 3 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id="dashboard-gpa" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor={LINE} stopOpacity={0.35} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 7]} />
            <XAxis dataKey="term" hide />
            <Tooltip
              content={<ChartTip format={(value) => value.toFixed(1)} />}
              wrapperStyle={{ zIndex: 200 }}
              cursor={{ stroke: "var(--color-border)" }}
            />
            <Area
              name="GPA"
              activeDot={{
                r: 4,
                stroke: "var(--color-background)",
                strokeWidth: 2,
              }}
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              fill="url(#dashboard-gpa)"
              dot={{ r: 2, fill: LINE }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          {series.map((point) => (
            <span key={point.term}>{point.term}</span>
          ))}
        </div>
      </div>
    </AcademicMetricCard>
  );
}
