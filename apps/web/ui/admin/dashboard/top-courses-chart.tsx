"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";

/** Courses in the most student plans, the most planned at full strength. */
export function TopCoursesChart({
  courses,
}: {
  courses: { code: string; students: number }[];
}) {
  if (courses.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No courses have been planned yet.
      </p>
    );
  }
  return (
    <ChartContainer
      config={{
        students: { label: "Students", color: "var(--color-primary)" },
      }}
      className="aspect-auto h-48 w-full"
      aria-label={courses
        .map((course) => `${course.code}: ${course.students} students`)
        .join(", ")}
    >
      <BarChart
        data={courses}
        margin={{ top: 18, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="22%"
        accessibilityLayer
      >
        <YAxis hide allowDecimals={false} />
        <XAxis
          dataKey="code"
          tickLine={false}
          axisLine={false}
          interval={0}
          tickMargin={8}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <Tooltip
          content={<ChartHoverCard suffix=" students" showNames={false} />}
          cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
        />
        <Bar dataKey="students" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="students"
            position="top"
            className="fill-muted-foreground text-[11px] tabular-nums"
          />
          {courses.map((course, index) => (
            <Cell
              key={course.code}
              fill="var(--color-primary)"
              fillOpacity={index === 0 ? 1 : 0.5}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
