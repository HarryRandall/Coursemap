import {
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import {
  gradeForMark,
  gradeStyles,
  periods,
  shortPeriod,
  type PreviewCourse,
} from "./preview-data";

export function PreviewMarkDistribution({
  courses,
  live = false,
}: {
  courses: PreviewCourse[];
  live?: boolean;
}) {
  const timelinePeriods = live
    ? [
        ...new Map(
          courses.map((course) => [
            course.term,
            { value: course.term, label: course.termLabel ?? course.term },
          ]),
        ).values(),
      ].sort((a, b) => b.value.localeCompare(a.value))
    : periods;
  const terms = timelinePeriods.filter((period) =>
    courses.some((course) => course.term === period.value),
  );
  const points = courses.map((course) => ({
    ...course,
    row: terms.findIndex((term) => term.value === course.term),
  }));
  return (
    <Card className="min-w-0 gap-0 py-3 sm:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Marks by semester</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-0 sm:px-5">
        {courses.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No marks yet
          </div>
        ) : (
          <ChartContainer
            config={{ mark: { label: "Mark", color: "var(--color-primary)" } }}
            className="aspect-auto h-32 w-full"
            aria-label={points
              .map((point) => `${point.code}: ${point.mark}%`)
              .join(", ")}
          >
            <ScatterChart
              accessibilityLayer
              margin={{ top: 20, right: 20, bottom: 0, left: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 5" />
              <XAxis
                type="number"
                dataKey="mark"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis
                type="number"
                dataKey="row"
                domain={[-0.5, terms.length - 0.5]}
                reversed
                ticks={terms.map((_, index) => index)}
                tickFormatter={(value) =>
                  terms[value]
                    ? live
                      ? terms[value].label
                      : shortPeriod(terms[value].value)
                    : ""
                }
                tickLine={false}
                axisLine={false}
                width={76}
              />
              <Scatter data={points} isAnimationActive={false}>
                {points.map((point) => (
                  <Cell
                    key={point.id ?? point.code}
                    fill={gradeStyles[gradeForMark(point.mark ?? 0)].colour}
                    stroke="var(--color-card)"
                    strokeWidth={2}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
