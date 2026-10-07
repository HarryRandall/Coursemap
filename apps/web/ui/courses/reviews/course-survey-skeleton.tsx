import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";

/**
 * Holds the survey panel's shape while its charts load: four summary cards,
 * the trend chart and the heatmap.
 */
export function CourseSurveySkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">
        Loading survey charts...
      </span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-card p-4"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-7 w-16" />
            <Skeleton className="mt-4 h-16 w-full" />
          </div>
        ))}
      </div>
      <Card className="gap-4 px-4 py-4">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </Card>
      <Card className="gap-4 px-4 py-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-48 w-full" />
      </Card>
    </div>
  );
}
