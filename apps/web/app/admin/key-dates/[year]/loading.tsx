import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";

export default function AdminKeyDatesLoading() {
  return (
    <AppShell admin loading>
      <div aria-busy="true" className="w-full space-y-6">
        <span className="sr-only">Loading key dates</span>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton
              key={index}
              className="h-[4.25rem] w-36 shrink-0 rounded-xl"
            />
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        {Array.from({ length: 2 }, (_, month) => (
          <div
            key={month}
            className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[11rem_minmax(0,1fr)]"
          >
            <div className="border-b border-border bg-muted/30 px-5 py-4 lg:border-r lg:border-b-0">
              <Skeleton className="h-3.5 w-24" />
            </div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
