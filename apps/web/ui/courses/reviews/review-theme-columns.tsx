"use client";

import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import type { SurveyThemeSummary } from "@/lib/course-surveys/survey-results";

/** Latest result for each theme, with the named theme drawn at full strength. */
export function ReviewThemeColumns({
  highlightKey,
  summaries,
}: {
  highlightKey: string;
  summaries: SurveyThemeSummary[];
}) {
  const points = summaries.map((summary) => ({
    key: summary.key,
    label: summary.shortLabel,
    agreement: summary.latest,
  }));
  return (
    <ChartContainer
      config={{
        agreement: { label: "Agreement", color: "var(--color-primary)" },
      }}
      className="aspect-auto h-16 w-full"
      aria-label={points
        .map((point) => `${point.label}: ${point.agreement}%`)
        .join(", ")}
    >
      <BarChart
        data={points}
        margin={{ top: 4, right: 0, bottom: 2, left: 0 }}
        barCategoryGap={4}
      >
        <YAxis hide domain={[0, 100]} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          height={16}
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(label: string) => label.slice(0, 1)}
        />
        <Tooltip
          content={<ChartHoverCard suffix="%" showNames={false} />}
          cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
        />
        <Bar
          dataKey="agreement"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        >
          {points.map((point) => (
            <Cell
              key={point.key}
              fill="var(--color-primary)"
              fillOpacity={point.key === highlightKey ? 1 : 0.3}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
