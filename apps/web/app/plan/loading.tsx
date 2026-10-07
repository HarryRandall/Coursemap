import { AppShell } from "@/ui/shell";
import { PlannerSkeleton } from "@/ui/plan/planner-skeleton";

export default function PlanLoading() {
  return (
    <AppShell loading fill fullWidth>
      <div aria-busy="true" className="workspace-scroll">
        <span className="sr-only">Loading your course plan</span>
        <PlannerSkeleton />
      </div>
    </AppShell>
  );
}
