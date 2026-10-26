import type { DegreeUnitProgress } from "@/lib/planner";
import { SemesterProgressRings } from "@/ui/common/semester-progress-rings";

/**
 * The degree's progress in one compact row: the semester rings with the
 * share completed, units completed against the target, then the completed,
 * planned and still-to-plan figures, which move underneath when narrow.
 */
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
      className="@container mb-4 shrink-0 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <SemesterProgressRings
            className="size-16"
            completed={progress.completed}
            enrolled={enrolledUnits}
            planned={Math.max(0, progress.planned - enrolledUnits)}
            target={target ?? 0}
          >
            {/* A block, so the ring's larger centre text does not lower it to its baseline. */}
            <span className="block text-xs leading-none font-semibold tabular-nums">
              {target
                ? Math.min(100, Math.round((progress.completed / target) * 100))
                : 0}
              %
            </span>
          </SemesterProgressRings>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              Overall progress
            </h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {progress.completed} / {target ?? "—"} units completed
            </p>
          </div>
        </div>
        <dl className="flex gap-6 @xl:ml-auto">
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
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className={`text-base font-semibold tabular-nums ${colour}`}>
                {value}
                <span className="ml-1 text-[11px] font-normal">units</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
