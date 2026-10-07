import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { KpiTileSkeleton } from "@/ui/common/kpi-tile";
import { AppShell } from "@/ui/shell";

function PanelSkeleton({ chartClassName }: { chartClassName: string }) {
  return (
    <Card className="gap-4 px-4 py-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={chartClassName} />
    </Card>
  );
}

/** Mirrors the admin dashboard: stat tiles, then paired chart panels. */
export default function AdminDashboardLoading() {
  return (
    <AppShell loading admin>
      <div aria-busy="true" className="mx-auto w-full space-y-4">
        <span className="sr-only">Loading the admin dashboard</span>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <KpiTileSkeleton key={index} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <PanelSkeleton chartClassName="h-56 w-full" />
          <PanelSkeleton chartClassName="h-56 w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <PanelSkeleton key={index} chartClassName="h-48 w-full" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
