import {
  formatPreviewMark,
  previewWam,
  previewGpa,
} from "@/lib/academic/preview-metrics";
import { Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { ChartContainer } from "@coursemap/ui/primitives/chart";
import { gradeForMark, gradeStyles, type PreviewCourse } from "./preview-data";
import { PreviewGrade } from "./preview-grade";

export function PreviewAverageGauge({
  courses,
  metric = "WAM",
}: {
  courses: PreviewCourse[];
  metric?: "WAM" | "GPA";
}) {
  const value = metric === "WAM" ? previewWam(courses) : previewGpa(courses);
  const average = value ?? 0;
  const maximum = metric === "WAM" ? 100 : 7;
  const colour =
    metric === "WAM"
      ? gradeStyles[gradeForMark(average)].colour
      : "var(--color-primary)";
  return (
    <Card className="min-w-0 gap-0 py-3">
      <CardHeader>
        <CardTitle>{metric}</CardTitle>
      </CardHeader>
      <CardContent className="relative flex flex-col items-center pb-0">
        <ChartContainer
          config={{ mark: { label: "Average mark", color: colour } }}
          className="aspect-auto h-32 w-full"
          aria-label={`${metric}: ${value === null ? "No results" : metric === "WAM" ? `${formatPreviewMark(average)}%` : `${average.toFixed(3)} out of 7`}`}
        >
          <PieChart>
            <Pie
              data={[{ value: 1 }]}
              dataKey="value"
              startAngle={210}
              endAngle={-30}
              innerRadius={55}
              outerRadius={67}
              cy="60%"
              fill="var(--border)"
              stroke="none"
              cornerRadius={7}
              isAnimationActive={false}
            />
            <Pie
              data={[{ value: 1 }]}
              dataKey="value"
              startAngle={210}
              endAngle={210 - (average / maximum) * 240}
              innerRadius={55}
              outerRadius={67}
              cy="60%"
              fill={colour}
              stroke="none"
              cornerRadius={7}
              isAnimationActive={false}
            />
          </PieChart>
        </ChartContainer>
        <div className="absolute top-[52px] flex flex-col items-center gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {value === null
              ? "—"
              : metric === "WAM"
                ? `${formatPreviewMark(average)}%`
                : average.toFixed(3)}
          </span>
          {metric === "WAM" && value !== null ? (
            <PreviewGrade mark={average} />
          ) : (
            <span className="text-xs text-muted-foreground">
              {metric === "GPA" ? "/ 7" : "/ 100"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
