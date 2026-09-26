import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { TabsLoading } from "@/ui/common/tabs-loading";
import { AppShell } from "@/ui/shell";

const MONTH_ROWS = [4, 3, 2];

export default function AdminKeyDatesLoading() {
  return (
    <AppShell
      admin
      loading
      tabs={<TabsLoading widths={["w-14", "w-12", "w-20"]} />}
    >
      <div aria-busy="true" className="w-full space-y-5">
        <span className="sr-only">Loading key dates</span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
        {MONTH_ROWS.map((rows, month) => (
          <div
            key={month}
            className="overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[11rem_minmax(0,1fr)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3 lg:flex-col lg:items-start lg:justify-start lg:gap-2 lg:border-r lg:border-b-0 lg:py-5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: rows }, (_, row) => (
                <div
                  key={row}
                  className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 px-4 py-3.5 sm:px-5 md:grid-cols-[3.5rem_minmax(0,1fr)_auto]"
                >
                  <div className="space-y-1.5">
                    <Skeleton className="h-2.5 w-7" />
                    <Skeleton className="h-5 w-7" />
                  </div>
                  <Skeleton
                    className={row % 2 ? "h-3.5 w-1/2" : "h-3.5 w-2/3"}
                  />
                  <Skeleton className="hidden h-5 w-24 rounded-md md:block" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
