import { CatalogueTableLoading } from "@/ui/admin/catalogue-table/catalogue-loading";
import { KpiTileSkeleton } from "@/ui/common/kpi-tile";
import { AppShell } from "@/ui/shell";

/** Mirrors the Reports tab: four tiles above the reports table. */
export default function SeltLoading() {
  return (
    <AppShell loading admin fill>
      <h1 className="sr-only">Loading SELT surveys</h1>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTileSkeleton />
          <KpiTileSkeleton visual={false} />
          <KpiTileSkeleton visual={false} />
          <KpiTileSkeleton visual={false} />
        </div>
        <CatalogueTableLoading noun="reports" layout="selt-reports" />
      </div>
    </AppShell>
  );
}
