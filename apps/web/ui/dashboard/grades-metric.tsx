"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GradeTally } from "@/lib/coursemap/academic-metrics";
import { ChartTip } from "./chart-tip";
import { AcademicMetricCard } from "./academic-metric-card";
import { gradesSkeleton } from "./metric-skeletons";
import { brand } from "./grade-colours";

const shortLabels: Record<GradeTally["code"], string> = {
  N: "N",
  P: "Pass",
  CR: "CR",
  D: "D",
  HD: "HD",
};
const axis = {
  fontSize: 10,
  fill: "var(--color-muted-foreground)",
  fontFamily: "inherit",
};

export function GradesMetric({ grades }: { grades: readonly GradeTally[] }) {
  // Bands arrive highest first; the chart climbs from fail to high distinction.
  const bars = [...grades].reverse().map((grade) => ({
    code: grade.code,
    grade: shortLabels[grade.code],
    count: grade.count,
  }));
  const total = grades.reduce((sum, grade) => sum + grade.count, 0);
  const distinctions = grades.find((grade) => grade.code === "HD")?.count ?? 0;
  return (
    <AcademicMetricCard
      empty={
        total === 0 ? { label: "No marks yet", skeleton: gradesSkeleton } : null
      }
      header={
        <>
          <h3 className="text-sm font-semibold">Grades</h3>
          {total > 0 ? (
            <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
              {Math.round((distinctions / total) * 100)}% HD
            </span>
          ) : null}
        </>
      }
    >
      <div
        className="enter-chart-bars min-h-24 flex-1"
        role="img"
        aria-label={`Grades: ${bars
          .map((bar) => `${bar.grade} ${bar.count}`)
          .join(", ")} courses`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 240, height: 96 }}
        >
          <BarChart
            data={bars}
            accessibilityLayer
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="2 4"
            />
            <YAxis hide allowDecimals={false} domain={[0, "dataMax"]} />
            <XAxis
              dataKey="grade"
              height={20}
              tick={axis}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={
                <ChartTip
                  format={(count) =>
                    `${count} ${count === 1 ? "course" : "courses"}`
                  }
                />
              }
              wrapperStyle={{ zIndex: 200 }}
              cursor={{ fill: "var(--color-muted)", fillOpacity: 0.3 }}
            />
            <Bar
              dataKey="count"
              name="Courses"
              maxBarSize={24}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              fill={brand}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AcademicMetricCard>
  );
}
