"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import { cn } from "@/lib/cn";

export type SparklineVariant = "area" | "bar" | "line";

const BRAND = "#7c3aed";
const FILL = "url(#sparklineFill)";

type Point = { index: number; value: number };

function LastDot({
  cx,
  cy,
  index,
  lastIndex,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  lastIndex: number;
}) {
  if (cx == null || cy == null || index !== lastIndex) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} fill="white" r={3.25} />
      <circle cx={cx} cy={cy} fill={BRAND} r={2} />
    </g>
  );
}

function axes(domain: [number, number]) {
  return (
    <>
      <XAxis dataKey="index" hide />
      <YAxis domain={domain} hide />
      <Tooltip
        content={
          <ChartHoverCard
            showLabel={false}
            showNames={false}
            format={(value) => Number(value).toLocaleString("en-AU")}
          />
        }
        cursor={false}
        isAnimationActive={false}
      />
    </>
  );
}

/** Compact Recharts trend used inside dashboard stat tiles. */
export function Sparkline({
  className,
  label,
  values,
  variant = "area",
  baseline = "zero",
}: {
  className?: string;
  label: string;
  values: readonly number[];
  variant?: SparklineVariant;
  /**
   * "zero" draws growth from nothing, prepending a zero when the series does
   * not start there. "data" fits the scale to the values, for a series such
   * as a running total or a score where the shape matters, not the size.
   */
  baseline?: "zero" | "data";
}) {
  if (values.length === 0) return null;
  const fitted = baseline === "data" && variant !== "bar";
  const series = fitted || values[0] === 0 ? values : [0, ...values];
  const low = Math.min(...series);
  const high = Math.max(...series, 1);
  // A tenth of the range above and below keeps the line off the edges.
  const padding = Math.max((high - low) * 0.1, 1);
  const domain: [number, number] = fitted
    ? [low - padding, high + padding]
    : [0, high];
  const data: Point[] = series.map((value, index) => ({ index, value }));
  const lastIndex = data.length - 1;
  const lastDot = (props: { cx?: number; cy?: number; index?: number }) => (
    <LastDot lastIndex={lastIndex} {...props} />
  );

  return (
    <div
      aria-label={label}
      className={cn("h-8 min-w-0 flex-1", className)}
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        {variant === "bar" ? (
          <BarChart
            data={data}
            margin={{ bottom: 2, left: 0, right: 4, top: 2 }}
          >
            {axes(domain)}
            <Bar
              dataKey="value"
              fill={BRAND}
              isAnimationActive={false}
              maxBarSize={8}
              radius={[1, 1, 0, 0]}
            />
          </BarChart>
        ) : variant === "line" ? (
          <LineChart
            data={data}
            margin={{ bottom: 2, left: 0, right: 6, top: 4 }}
          >
            {axes(domain)}
            <Line
              activeDot={false}
              dataKey="value"
              dot={lastDot}
              isAnimationActive={false}
              stroke={BRAND}
              strokeWidth={1.75}
              type="monotone"
            />
          </LineChart>
        ) : (
          <AreaChart
            data={data}
            margin={{ bottom: 2, left: 0, right: 6, top: 4 }}
          >
            <defs>
              <linearGradient id="sparklineFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes(domain)}
            <Area
              activeDot={false}
              dataKey="value"
              dot={lastDot}
              fill={FILL}
              isAnimationActive={false}
              stroke={BRAND}
              strokeWidth={1.75}
              type="monotone"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
