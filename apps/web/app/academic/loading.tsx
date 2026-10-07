import { AppShell } from "@/ui/shell";
import { AcademicSkeleton } from "@/ui/academic/academic-skeleton";

export default function AcademicLoading() {
  return (
    <AppShell loading fill>
      <div aria-busy="true" className="workspace-scroll mx-auto">
        <span className="sr-only">Loading academic overview</span>
        <AcademicSkeleton />
      </div>
    </AppShell>
  );
}
