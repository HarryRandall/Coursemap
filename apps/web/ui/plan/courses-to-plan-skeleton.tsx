import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { cn } from "@/lib/cn";

/** Keep partial course suggestions and counts out of the loading state. */
export function CoursesToPlanSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading course suggestions"
      className={cn(
        "flex min-h-80 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex gap-5 border-b border-border px-4 py-5"
      >
        {[0, 1, 2, 3].map((tab) => (
          <Skeleton key={tab} className="h-4 w-12" />
        ))}
      </div>
      <div aria-hidden="true" className="space-y-8 overflow-hidden p-4">
        {[0, 1].map((group) => (
          <div key={group} className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3 py-1">
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="size-3 shrink-0" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
