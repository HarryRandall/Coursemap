"use client";

import { useId } from "react";
import { Area, AreaChart, ReferenceLine, Tooltip, YAxis } from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import {
  type CourseSurveyResults,
  OVERALL_THEME,
  median,
  surveyLabel,
} from "@/lib/course-surveys/survey-results";

/** Overall experience across every semester, ending on the latest result. */
export function ReviewOverallSparkline({
  results,
}: {
  results: CourseSurveyResults;
}) {
  const points = results.surveys.map((survey) => ({
    label: surveyLabel(survey),
    agreement: survey.agreementPercent[OVERALL_THEME],
  }));
  const usual = median(points.map((point) => point.agreement));
  const lastIndex = points.length - 1;
  const gradient = useId().replace(/:/g, "");
  return (
    <ChartContainer
      role="img"
      config={{
        agreement: { label: "Overall", color: "var(--color-primary)" },
      }}
      className="aspect-auto h-16 w-full"
      aria-label={points
        .map((point) => `${point.label}: ${point.agreement}%`)
        .join(", ")}
    >
      <AreaChart
        data={points}
        margin={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-primary)"
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor="var(--color-primary)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        {/* A sparkline shows shape, so the scale hugs the data instead of 0 to 100. */}
        <YAxis hide domain={["dataMin - 6", "dataMax + 6"]} />
        <ReferenceLine
          y={usual}
          stroke="var(--color-muted-foreground)"
          strokeDasharray="3 4"
          strokeOpacity={0.6}
        />
        <Tooltip
          content={<ChartHoverCard suffix="%" showNames={false} />}
          cursor={false}
        />
        <Area
          type="linear"
          dataKey="agreement"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill={`url(#${gradient})`}
          dot={({ cx, cy, index }) =>
            index === lastIndex ? (
              <circle
                key="latest"
                cx={cx}
                cy={cy}
                r={4}
                fill="var(--color-primary)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            ) : (
              <g key={index} />
            )
          }
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
