import type { ReactNode } from "react";
import { PreviewAverageGauge } from "./preview-average-gauge";
import { PreviewMarkDistribution } from "./preview-mark-distribution";
import { PreviewTrendChart } from "./preview-trend-chart";
import { PreviewGradeChart } from "./preview-grade-chart";
import { PreviewTimeline } from "./preview-timeline";
import { type PreviewCourse } from "./preview-data";

export function PreviewLayout({
  design,
  courses,
  onSelect,
  onAction,
  live = false,
  placeholder,
}: {
  design: string;
  live?: boolean;
  courses: PreviewCourse[];
  onSelect: (code: string) => void;
  onAction?: (code: string, action: "clear" | "remove") => void;
  /** Shown in place of an empty timeline, such as before onboarding. */
  placeholder?: ReactNode;
}) {
  const results = courses.filter((course) => course.mark !== undefined);
  return (
    <div className={live ? "workspace-stack" : "space-y-4"}>
      {courses.length || live ? (
        <div
          className={
            design === "3"
              ? "grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]"
              : design === "2"
                ? "grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
                : "grid items-stretch gap-5 lg:grid-cols-2"
          }
        >
          {design === "3" ? (
            <>
              <PreviewAverageGauge courses={courses} />
              <PreviewAverageGauge courses={courses} metric="GPA" />
              <PreviewMarkDistribution courses={results} live={live} />
            </>
          ) : (
            <>
              <PreviewTrendChart
                courses={results}
                individual={design === "2"}
              />
              <PreviewGradeChart courses={results} design={design} />
            </>
          )}
        </div>
      ) : null}
      <div
        className={live ? "workspace-scroll" : undefined}
        role={live ? "region" : undefined}
        aria-label={live ? "Academic results" : undefined}
        tabIndex={live ? 0 : undefined}
      >
        {placeholder && !courses.length ? (
          placeholder
        ) : (
          <PreviewTimeline
            live={live}
            courses={courses}
            design={design}
            onSelect={onSelect}
            onAction={onAction}
          />
        )}
      </div>
    </div>
  );
}
