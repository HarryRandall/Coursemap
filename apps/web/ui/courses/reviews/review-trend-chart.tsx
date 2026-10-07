"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@coursemap/ui/lib/utils";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import {
  type CourseSurveyResults,
  type SurveyThemeKey,
  OVERALL_THEME,
  SURVEY_THEMES,
  agreementInterval,
  median,
  surveyLabel,
  surveyShortLabel,
} from "@/lib/course-surveys/survey-results";

type TrendPoint = {
  label: string;
  fullLabel: string;
  agreement: number;
  range: [number, number];
  respondents: number;
  isFirstSemester: boolean;
};

/** One theme over time, with the 90% interval drawn as a band. */
export function ReviewTrendChart({
  results,
}: {
  results: CourseSurveyResults;
}) {
  const [themeKey, setThemeKey] = useState<SurveyThemeKey>(OVERALL_THEME);
  const theme = SURVEY_THEMES.find((entry) => entry.key === themeKey)!;
  const points: TrendPoint[] = results.surveys.map((survey) => {
    const agreement = survey.agreementPercent[themeKey];
    const interval = agreementInterval(agreement, survey.respondents);
    return {
      label: surveyShortLabel(survey),
      fullLabel: surveyLabel(survey),
      agreement,
      range: [interval.low, interval.high],
      respondents: survey.respondents,
      isFirstSemester: survey.session === "sem_1",
    };
  });
  const usual = median(points.map((point) => point.agreement));
  const hasBothSessions =
    points.some((point) => point.isFirstSemester) &&
    points.some((point) => !point.isFirstSemester);

  return (
    <figure className="space-y-4">
      <Tabs
        value={themeKey}
        onValueChange={(value) => setThemeKey(value as SurveyThemeKey)}
      >
        <TabsList
          aria-label="Survey theme"
          className="max-w-full overflow-x-auto"
        >
          {SURVEY_THEMES.map((entry) => (
            <TabsTrigger key={entry.key} value={entry.key}>
              {entry.shortLabel}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ChartContainer
        config={{
          agreement: { label: theme.label, color: "var(--color-primary)" },
        }}
        className="aspect-auto h-64 w-full"
        aria-label={points
          .map((point) => `${point.fullLabel}: ${point.agreement}%`)
          .join(", ")}
      >
        <ComposedChart
          data={points}
          margin={{ top: 10, right: 16, bottom: 0, left: -14 }}
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
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            minTickGap={16}
            tickMargin={10}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          />
          <ReferenceLine
            y={usual}
            stroke="var(--color-muted-foreground)"
            strokeDasharray="4 5"
            strokeOpacity={0.6}
          />
          <Tooltip
            content={<TrendHoverCard />}
            cursor={{
              stroke: "var(--color-muted-foreground)",
              strokeDasharray: "3 4",
            }}
          />
          <Area
            type="linear"
            dataKey="range"
            stroke="none"
            fill="var(--color-primary)"
            fillOpacity={0.14}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="agreement"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={<SessionDot />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {hasBothSessions ? (
          <>
            <LegendDot filled label="Semester 1" />
            <LegendDot filled={false} label="Semester 2" />
          </>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-4 rounded-sm bg-primary/15"
          />
          Approximate 90% interval
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-4 border-t border-dashed border-muted-foreground"
          />
          Usual {Math.round(usual)}%
        </span>
      </figcaption>
    </figure>
  );
}

function SessionDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
}) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      strokeWidth={2}
      stroke="var(--color-primary)"
      fill={
        payload.isFirstSemester
          ? "var(--color-primary)"
          : "var(--color-background)"
      }
    />
  );
}

function LegendDot({ filled, label }: { filled: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 rounded-full border-2 border-primary",
          filled ? "bg-primary" : "bg-background",
        )}
      />
      {label}
    </span>
  );
}

function TrendHoverCard({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: TrendPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="coursemap-tooltip w-max max-w-56 space-y-0.5 px-3 py-2 text-xs">
      <p className="font-medium">{point.fullLabel}</p>
      <p>
        <span className="font-semibold tabular-nums">{point.agreement}%</span>{" "}
        agreed
      </p>
      <p className="opacity-80">
        Likely {point.range[0]} to {point.range[1]}%, {point.respondents}{" "}
        responses
      </p>
    </div>
  );
}
