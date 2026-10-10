"use client";

import { Bar, BarChart, Cell, Tooltip, YAxis } from "recharts";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { ChartHoverCard } from "@/ui/common/chart-tooltip";
import {
  type CourseSurveyResults,
  surveyLabel,
} from "@/lib/course-surveys/survey-results";

/** Respondents in each semester, with the latest at full strength. */
export function ReviewResponseColumns({
  results,
}: {
  results: CourseSurveyResults;
}) {
  const points = results.surveys.map((survey) => ({
    label: surveyLabel(survey),
    respondents: survey.respondents,
  }));
  const lastIndex = points.length - 1;
  return (
    <ChartContainer
      role="img"
      config={{
        respondents: { label: "Responses", color: "var(--color-primary)" },
      }}
      className="aspect-auto h-16 w-full"
      aria-label={points
        .map((point) => `${point.label}: ${point.respondents} responses`)
        .join(", ")}
    >
      <BarChart
        data={points}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap={2}
      >
        <YAxis hide domain={[0, "dataMax"]} />
        <Tooltip
          content={<ChartHoverCard suffix=" responses" showNames={false} />}
          cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
        />
        <Bar
          dataKey="respondents"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        >
          {points.map((point, index) => (
            <Cell
              key={point.label}
              fill="var(--color-primary)"
              fillOpacity={index === lastIndex ? 1 : 0.3}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
