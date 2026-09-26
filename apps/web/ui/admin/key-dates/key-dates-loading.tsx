import { Skeleton } from "@coursemap/ui/primitives/skeleton";

const MONTH_ROWS = [4, 3, 2];

/** Stands in for the month list on the Dates tab. */
export function KeyDatesListLoading() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading key dates</span>
      {MONTH_ROWS.map((rows, month) => (
        <div
          key={month}
          className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 lg:flex-col lg:items-start lg:justify-start lg:gap-1.5 lg:border-r lg:border-b-0 lg:py-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="divide-y divide-border/60">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-3 py-3 pr-4 pl-4">
                <div className="w-9 space-y-1">
                  <Skeleton className="h-2.5 w-6" />
                  <Skeleton className="h-4 w-6" />
                </div>
                <Skeleton className={row % 2 ? "h-3.5 w-1/2" : "h-3.5 w-2/3"} />
                <Skeleton className="ml-auto hidden h-5 w-20 rounded-md md:block" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stands in for the sync review or the sync prompt. */
export function KeyDatesSyncLoading() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col gap-4">
      <span className="sr-only">Loading the sync</span>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-64 w-full flex-1 rounded-xl" />
    </div>
  );
}

/** Stands in for the changelog timeline. */
export function KeyDatesChangelogLoading() {
  return (
    <div aria-busy="true" className="space-y-1">
      <span className="sr-only">Loading the changelog</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-3 px-2 py-2.5">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={index % 2 ? "h-3.5 w-1/3" : "h-3.5 w-1/2"} />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
