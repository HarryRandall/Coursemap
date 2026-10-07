import { AppShell } from "@/ui/shell";
import { DashboardSkeleton } from "@/ui/dashboard/dashboard-skeleton";

/** The dashboard's layout in outline, so nothing moves when it loads. */
export default function DashboardLoading() {
  return (
    <AppShell loading>
      <div aria-busy="true">
        <span className="sr-only">Loading dashboard</span>
        <DashboardSkeleton />
      </div>
    </AppShell>
  );
}
