"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DonutChart, TrendChart, chartColours } from "./metric-charts";
import { MetricCardView } from "./metric-cards";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import { Button } from "@coursemap/ui/primitives/button";

// Design-only fixtures. These do not represent the signed-in student's records.
const gpa = [
  { term: "S1 '25", value: 5.8 },
  { term: "S2 '25", value: 6.1 },
  { term: "S1 '26", value: 5.9 },
  { term: "S2 '26", value: 6.4 },
];
const grades = [
  { grade: "N", count: 1 },
  { grade: "Pass", count: 2 },
  { grade: "CR", count: 4 },
  { grade: "D", count: 5 },
  { grade: "HD", count: 8 },
];
const colours = [
  "var(--color-muted-foreground)",
  "#fbbf24",
  "#60a5fa",
  "#a78bfa",
  "#34d399",
];
const marksBySemester = [
  {
    label: "S1 '26",
    courses: [
      { code: "COMP2100", mark: 78 },
      { code: "COMP2300", mark: 74 },
      { code: "MATH1013", mark: 82 },
      { code: "FINM2001", mark: 70 },
    ],
  },
  {
    label: "S2 '26",
    courses: [
      { code: "COMP3600", mark: 88 },
      { code: "FINM3008", mark: 79 },
      { code: "COMP3900", mark: 85 },
      { code: "MATH2301", mark: 76 },
    ],
  },
];
const fees = [
  { year: "2026", amount: 10200 },
  { year: "2027", amount: 10800 },
  { year: "2028", amount: 11400 },
];
const axis = {
  fontSize: 10,
  fill: "var(--color-muted-foreground)",
  fontFamily: "inherit",
};

function Metric({
  title,
  value,
  unit,
  header,
  children,
}: {
  title: string;
  value?: string;
  unit?: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 py-0">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {header ? (
          <div className="flex min-h-7 items-center justify-between gap-2">
            {header}
          </div>
        ) : (
          <div className="flex min-h-7 items-baseline justify-between gap-2">
            {value ? (
              <p className="shrink-0 text-xl font-semibold tracking-tight tabular-nums">
                {value}
                <span className="ml-1 text-xs font-normal tracking-normal text-muted-foreground">
                  {unit}
                </span>
              </p>
            ) : null}
            <h3 className="text-xs font-medium text-muted-foreground">
              {title}
            </h3>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function TuitionMetric({ preview = false }: { preview?: boolean }) {
  return (
    <Metric title="Est. tuition" value={preview ? "$32,400" : undefined}>
      {preview ? (
        <div className="flex min-h-24 flex-1 flex-col justify-between gap-2 py-1">
          {fees.map((fee, i) => (
            <div
              key={fee.year}
              className="grid grid-cols-[2rem_1fr_3.5rem] items-center gap-2 text-[10px]"
            >
              <span className="text-muted-foreground">{fee.year}</span>
              <div className="h-3 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(fee.amount / Math.max(...fees.map((entry) => entry.amount))) * 100}%`,
                    background: ["#60a5fa", "#818cf8", "#a78bfa"][i],
                  }}
                />
              </div>
              <span className="text-right tabular-nums">
                ${fee.amount.toLocaleString("en-AU")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-24 flex-col justify-center gap-1">
          <p className="text-sm font-medium">Estimate unavailable</p>
          <p className="text-xs text-muted-foreground">
            Tuition will appear when fee information is available.
          </p>
        </div>
      )}
    </Metric>
  );
}

export function UniversityMetricsPreview() {
  const [semesterIndex, setSemesterIndex] = useState(
    marksBySemester.length - 1,
  );
  const semester = marksBySemester[semesterIndex];
  const average = Math.round(
    semester.courses.reduce((sum, course) => sum + course.mark, 0) /
      semester.courses.length,
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        title="GPA"
        header={
          <div className="flex w-full items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">GPA</h3>
            <span className="text-sm font-semibold tabular-nums">
              6.4
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / 7
              </span>
            </span>
          </div>
        }
      >
        <div
          className="h-24"
          role="img"
          aria-label="Mock GPA: 5.8, 6.1, 5.9 and 6.4 over four semesters"
        >
          <ResponsiveContainer
            width="100%"
            height={76}
            initialDimension={{ width: 240, height: 76 }}
          >
            <AreaChart
              data={gpa}
              margin={{ top: 6, right: 3, bottom: 0, left: 3 }}
              accessibilityLayer
            >
              <defs>
                <linearGradient id="preview-gpa" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#a78bfa" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 7]} />
              <XAxis dataKey="term" hide />
              <Tooltip
                content={<ChartHoverCard />}
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
                stroke="#a78bfa"
                strokeWidth={2}
                fill="url(#preview-gpa)"
                dot={{ r: 2, fill: "#a78bfa" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            {gpa.map((point) => (
              <span key={point.term}>{point.term}</span>
            ))}
          </div>
        </div>
      </Metric>
      <Metric
        title="Grade distribution"
        header={
          <>
            <h3 className="text-sm font-semibold">Grades</h3>
            <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
              40% HD
            </span>
          </>
        }
      >
        <div
          className="min-h-24 flex-1"
          role="img"
          aria-label="Mock grades: N 1, Pass 2, CR 4, D 5, HD 8 courses"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 240, height: 96 }}
          >
            <BarChart
              data={grades}
              accessibilityLayer
              margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="2 4"
              />
              <YAxis hide domain={[0, "dataMax"]} />
              <XAxis
                dataKey="grade"
                height={20}
                tick={axis}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<ChartHoverCard />}
                wrapperStyle={{ zIndex: 200 }}
                cursor={{ fill: "var(--color-muted)", fillOpacity: 0.3 }}
              />
              <Bar
                dataKey="count"
                name="Courses"
                maxBarSize={24}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              >
                {grades.map((g, i) => (
                  <Cell key={g.grade} fill={colours[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Metric>
      <TuitionMetric preview />
      <Metric
        title="Average mark"
        header={
          <>
            <h3 className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums">
                {average}%
              </span>
              <span
                className="text-xs text-muted-foreground"
                aria-label="Average mark"
              >
                Avg.
              </span>
            </h3>{" "}
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous semester marks"
                disabled={semesterIndex === 0}
                onClick={() =>
                  setSemesterIndex((index) => Math.max(0, index - 1))
                }
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
                disabled={semesterIndex === marksBySemester.length - 1}
                onClick={() =>
                  setSemesterIndex((index) =>
                    Math.min(marksBySemester.length - 1, index + 1),
                  )
                }
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </>
        }
      >
        <div className="flex h-24 flex-col justify-center gap-2">
          {semester.courses.map((course, i) => (
            <div
              key={course.code}
              className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2 text-[10px]"
            >
              <span className="text-muted-foreground">{course.code}</span>
              <div className="relative h-px bg-border">
                <span
                  className="absolute -top-1.5 h-3 border-l border-dashed border-muted-foreground/50"
                  style={{ left: "80%" }}
                />
                <span
                  className="absolute -top-1 size-2 -translate-x-1/2 rounded-full"
                  style={{
                    left: `${course.mark}%`,
                    background: ["#a78bfa", "#60a5fa", "#34d399", "#f472b6"][i],
                  }}
                />
              </div>
              <span className="text-right tabular-nums">{course.mark}</span>
            </div>
          ))}
        </div>
      </Metric>
    </div>
  );
}

// Design-only planning values for the dashboard preview.
export function PlanningMetricsPreview() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCardView
        compact
        view={{
          id: "load",
          title: "Current semester",
          value: "18",
          unit: "/ 24 units",
          note: "3 courses scheduled",
          aside: (
            <DonutChart
              compact
              half
              segments={[
                { name: "Scheduled units", value: 18, fill: chartColours.blue },
                { name: "Available units", value: 6, fill: chartColours.muted },
              ]}
            />
          ),
        }}
      />
      <MetricCardView
        compact
        view={{
          id: "coverage",
          title: "Planning coverage",
          value: "67%",
          unit: "allocated",
          note: "96 of 144 units have a place",
          aside: (
            <DonutChart
              compact
              segments={[
                {
                  name: "Allocated units",
                  value: 96,
                  fill: chartColours.violet,
                },
                {
                  name: "Unallocated units",
                  value: 48,
                  fill: chartColours.muted,
                },
              ]}
            />
          ),
        }}
      />
      <MetricCardView
        compact
        view={{
          id: "semester-bars",
          title: "Upcoming semester load",
          value: "24",
          unit: "units next semester",
          note: "S1 '27 onwards",
          body: (
            <TrendChart
              kind="bar"
              colour={chartColours.blue}
              points={[
                { label: "S1 '27", units: 24 },
                { label: "S2 '27", units: 18 },
                { label: "S1 '28", units: 24 },
                { label: "S2 '28", units: 12 },
              ]}
            />
          ),
        }}
      />
    </div>
  );
}
