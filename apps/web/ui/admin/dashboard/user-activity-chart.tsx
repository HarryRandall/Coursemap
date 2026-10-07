"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import type { AdminDashboardData } from "@/lib/admin/dashboard";
import { shortDayLabel } from "@/lib/admin/dashboard-series";

/** Total accounts against students who changed a plan, week by week. */
export function UserActivityChart({
  users,
}: {
  users: AdminDashboardData["users"];
}) {
  const gradient = useId().replace(/:/g, "");
  const points = users.weeks.map((week, index) => ({
    label: shortDayLabel(week),
    accounts: users.cumulative[index],
    active: users.active[index],
  }));
  return (
    <figure className="space-y-3">
      <ChartContainer
        config={{
          accounts: { label: "Accounts", color: "var(--color-primary)" },
          active: { label: "Planned that week", color: "var(--color-chart-2)" },
        }}
        className="aspect-auto h-48 w-full"
        aria-label={`${users.total} accounts. ${users.active.at(-1) ?? 0} students changed a plan this week.`}
      >
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity={0.22}
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--color-border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
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
            cursor={{
              stroke: "var(--color-muted-foreground)",
              strokeDasharray: "3 4",
            }}
          />
          <Area
            type="monotone"
            dataKey="accounts"
            name="Accounts"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill={`url(#${gradient})`}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="active"
            name="Planned that week"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary" />
          Accounts
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: "var(--color-chart-2)" }}
          />
          Changed a plan that week
        </span>
      </figcaption>
    </figure>
  );
}
