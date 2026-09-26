import type { DegreeUnitProgress } from "@/lib/planner";
import { SemesterProgressRings } from "@/ui/common/semester-progress-rings";

export function StructureProgress({
  name,
  target,
  progress,
  enrolledUnits,
}: {
  name: string;
  target: number | null;
  progress: DegreeUnitProgress;
  enrolledUnits: number;
}) {
  return (
    <section
      aria-label={`${name} progress`}
      className="@container mb-5 shrink-0 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-6 @md:flex-nowrap">
        <div className="flex flex-wrap items-center gap-5">
          <SemesterProgressRings
            completed={progress.completed}
            enrolled={enrolledUnits}
            planned={Math.max(0, progress.planned - enrolledUnits)}
            target={target ?? 0}
          >
            {target
              ? Math.min(100, Math.round((progress.completed / target) * 100))
              : 0}
            %
          </SemesterProgressRings>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Overall progress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.completed} / {target ?? "—"} units completed
            </p>
          </div>
        </div>
        {/* Figures sit in three even columns under the ring in a narrow
            card and move beside it once there is room. */}
        <dl className="grid w-full grid-cols-3 gap-4 @4xl:flex @4xl:w-auto @4xl:gap-6">
          {[
            ["Completed", progress.completed, "text-success"],
            ["Planned", progress.planned, "text-primary"],
            [
              "Still to plan",
              target === null ? "—" : progress.remaining,
              "text-muted-foreground",
            ],
          ].map(([label, value, colour]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className={`mt-1 text-xl font-semibold tabular-nums @4xl:text-2xl ${colour}`}
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
