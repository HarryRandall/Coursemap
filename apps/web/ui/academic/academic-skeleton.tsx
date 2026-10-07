import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";

/** Academic history in outline, for loading and for empty plans. */
export function AcademicSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="h-44 p-4">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-2.5 w-24 max-w-full" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="space-y-2 border-b border-border/60 px-5 py-4">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 5 }, (_, row) => (
            <div key={row} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-28" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
