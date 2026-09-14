import type { DegreeUnitProgress } from "@/lib/planner";
import { ProgressRing } from "@/ui/common/progress-ring";

export function StructureProgress({
  name,
  code,
  year,
  target,
  progress,
}: {
  name: string;
  code: string;
  year: number | null;
  target: number | null;
  progress: DegreeUnitProgress;
}) {
  return (
    <section
      aria-label={`${name} progress`}
      className="mb-6 shrink-0 rounded-2xl border border-border bg-card p-6 sm:p-8"
    >
      <p className="mb-6 text-sm text-muted-foreground">
        {name} · {code}
        {year ? ` · ${year}` : ""}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-wrap items-center gap-6">
          {target !== null && target > 0 && (
            <ProgressRing
              completed={progress.completed}
              planned={progress.planned}
              target={target}
              size="large"
            >
              {Math.min(100, Math.round((progress.completed / target) * 100))}%
            </ProgressRing>
          )}
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Overall progress
            </h2>
            {target !== null && (
              <p className="mt-2 text-base text-muted-foreground">
                {target} units to complete your degree
              </p>
            )}
          </div>
        </div>
        <dl className="flex flex-wrap gap-7">
          {[
            ["Completed", progress.completed, "text-success"],
            ["Planned", progress.planned, "text-primary"],
            ...(target !== null
              ? [["Still to plan", progress.remaining, "text-muted-foreground"]]
              : []),
          ].map(([label, value, colour]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className={`mt-2 text-3xl font-semibold tabular-nums ${colour}`}
              >
                {value}
                <span className="ml-1 text-xs font-normal"> units</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
