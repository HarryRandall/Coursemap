"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import type { SyncOutcomeDay } from "@/lib/admin/dashboard";
import { shortDayLabel } from "@/lib/admin/dashboard-series";

// Outcomes are states, so they use the status colours rather than the
// categorical chart palette. Cancelled is neutral because nothing is wrong.
const OUTCOMES = [
  { key: "applied", label: "Applied", color: "var(--color-primary)" },
  { key: "review", label: "Needs review", color: "var(--color-warning)" },
  { key: "failed", label: "Failed", color: "var(--color-destructive)" },
  {
    key: "cancelled",
    label: "Cancelled",
    color: "var(--color-muted-foreground)",
  },
] as const;

export function SyncOutcomesChart({ days }: { days: SyncOutcomeDay[] }) {
  const points = days.map((day) => ({ ...day, label: shortDayLabel(day.day) }));
  const total = days.reduce(
    (sum, day) => sum + day.applied + day.review + day.failed + day.cancelled,
    0,
  );
  return (
    <figure className="space-y-3">
      <ChartContainer
        config={Object.fromEntries(
          OUTCOMES.map((outcome) => [
            outcome.key,
            { label: outcome.label, color: outcome.color },
          ]),
        )}
        className="aspect-auto h-56 w-full"
        aria-label={`${total} catalogue syncs in the last ${days.length} days`}
      >
        <BarChart
          data={points}
          margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
          barCategoryGap={2}
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={6}
            tickMargin={8}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <Tooltip
            content={<ChartHoverCard />}
            cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
          />
          {OUTCOMES.map((outcome, index) => (
            <Bar
              key={outcome.key}
              dataKey={outcome.key}
              name={outcome.label}
              stackId="outcome"
              fill={outcome.color}
              radius={index === OUTCOMES.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {OUTCOMES.map((outcome) => (
          <span key={outcome.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: outcome.color }}
            />
            {outcome.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
