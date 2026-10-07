import { AppShell } from "@/ui/shell";
import { RequirementsSkeleton } from "@/ui/requirements/requirements-skeleton";

export default function RequirementsLoading() {
  return (
    <AppShell loading fill>
      <div aria-busy="true" className="workspace-scroll">
        <span className="sr-only">Loading degree requirements</span>
        <RequirementsSkeleton />
      </div>
    </AppShell>
  );
}
