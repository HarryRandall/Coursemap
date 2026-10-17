import type { CourseAssessment } from "@/lib/coursemap/course-types";

const colours = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
];

/** Weighted assessment as one bar, with each task named beneath it. */
export function AssessmentWeights({
  assessments,
}: {
  assessments: CourseAssessment[];
}) {
  const weighted = assessments.filter(
    (assessment) => assessment.weight !== null && assessment.weight > 0,
  );
  return (
    <div>
      {weighted.length > 0 ? (
        <div
          aria-hidden="true"
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
        >
          {weighted.map((assessment, index) => (
            <span
              key={assessment.position}
              style={{
                flexGrow: assessment.weight ?? 0,
                background: colours[index % colours.length],
              }}
            />
          ))}
        </div>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-[13px]">
        {assessments.map((assessment) => {
          const index = weighted.indexOf(assessment);
          return (
            <li key={assessment.position} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-muted"
                style={
                  index >= 0
                    ? { background: colours[index % colours.length] }
                    : undefined
                }
              />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {assessment.title}
                {assessment.hurdle ? (
                  <span className="ml-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                    Hurdle
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {assessment.weight !== null ? `${assessment.weight}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
