import { CoursesToPlanSkeleton } from "@/ui/plan/courses-to-plan-skeleton";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";

/**
 * The planner in outline: the year cards, two stacked semesters and the
 * courses-to-plan panel. Used while it loads and behind the set-up prompt.
 */
export function PlannerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2">
        {[0, 1, 2].map((year) => (
          <div
            key={year}
            className="space-y-2 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-1 w-full rounded-full" />
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-border" />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {["First Semester", "Second Semester"].map((name) => (
            <div
              key={name}
              className="flex flex-col gap-1 rounded-xl bg-card p-2.5 ring-1 ring-border"
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[13px] font-semibold text-foreground">
                  {name}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  0 / 24 units
                </span>
              </div>
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="min-h-[52px] rounded-lg border border-dashed border-border"
                />
              ))}
            </div>
          ))}
        </div>
        <CoursesToPlanSkeleton className="lg:h-[calc(100dvh-12rem)] lg:w-[24rem] lg:shrink-0" />
      </div>
    </div>
  );
}
