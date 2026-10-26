"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import type { AssistantVisual } from "@/lib/assistant/attachments";
import { ChartTip } from "@/ui/dashboard/chart-tip";
import { brand } from "@/ui/dashboard/grade-colours";

type LineVisual = Extract<AssistantVisual, { kind: "line" }>;

function format(value: number, max: number) {
  // GPAs read to two places; marks and other larger scales to one.
  return max <= 10 ? value.toFixed(2) : value.toFixed(1);
}

/**
 * A measure over study periods, such as GPA or WAM. Each series keeps its own
 * scale and is shown one at a time, so two measures never share an axis.
 */
export function AssistantTrendChart({ visual }: { visual: LineVisual }) {
  const [selected, setSelected] = useState(0);
  const gradientId = `compass-trend-${useId().replace(/:/gu, "")}`;
  const series = visual.series[Math.min(selected, visual.series.length - 1)];
  // A trend reads from its own range, not from zero, so a GPA moving between
  // 5.5 and 6.25 does not draw as a flat line along the top.
  const values = series.points.map((point) => point.value);
  const padding = (series.max - series.min) * 0.08;
  const domain = [
    Math.max(series.min, Math.min(...values) - padding),
    Math.min(series.max, Math.max(...values) + padding),
  ];
  const latest = series.points.at(-1);
  const first = series.points[0];
  const change =
    latest && first && series.points.length > 1
      ? latest.value - first.value
      : null;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl leading-none font-semibold tracking-tight tabular-nums">
            {latest ? format(latest.value, series.max) : "None"}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {series.name}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latest ? `Latest, ${latest.label}` : "No results yet"}
            {change !== null
              ? ` · ${change >= 0 ? "up" : "down"} ${format(Math.abs(change), series.max)} since ${first.label}`
              : ""}
          </p>
        </div>
        {visual.series.length > 1 ? (
          <Tabs
            value={String(selected)}
            onValueChange={(value) => setSelected(Number(value))}
          >
            <TabsList aria-label="Measure" className="h-7">
              {visual.series.map((item, index) => (
                <TabsTrigger
                  key={item.name}
                  value={String(index)}
                  className="px-2.5 text-xs"
                >
                  {item.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      <div
        className="h-24"
        role="img"
        aria-label={`${series.name} by study period: ${series.points
          .map((point) => `${point.label} ${format(point.value, series.max)}`)
          .join(", ")}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 320, height: 96 }}
        >
          <AreaChart
            data={series.points}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            accessibilityLayer
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor={brand} stopOpacity={0.3} />
                <stop offset="100%" stopColor={brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={domain} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              interval="preserveStartEnd"
            />
            <Tooltip
              content={
                <ChartTip format={(value) => format(value, series.max)} />
              }
              wrapperStyle={{ zIndex: 200 }}
              cursor={{ stroke: "var(--color-border)" }}
            />
            <Area
              name={series.name}
              dataKey="value"
              stroke={brand}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: brand, strokeWidth: 0 }}
              activeDot={{
                r: 5,
                stroke: "var(--color-background)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
