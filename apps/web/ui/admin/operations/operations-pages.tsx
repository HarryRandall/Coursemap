import { notFound } from "next/navigation";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import {
  loadDiscoveryCheck,
  loadDiscoveryChecks,
  loadSyncDetail,
  loadSyncOperationsPage,
} from "@/lib/coursemap/admin-operations";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { AppShell } from "@/ui/shell";
import { DiscoveryDetailView } from "./discovery-detail";
import { DiscoveryList } from "./discovery-list";
import {
  OperationsTabList,
  OperationsTabs,
  type OperationsSection,
} from "./operations-tabs";
import { SyncDetailView } from "./sync-detail";
import { SyncList } from "./sync-list";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Catalogue operations. Everything here is technical by design: statuses,
 * attempts, leases, model responses and costs, behind the catalogue operations
 * permission rather than the permission to author content.
 */
export async function CatalogueOperationsPage({
  section,
  searchParams,
}: {
  section: OperationsSection;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const page =
    section === "syncs"
      ? await loadSyncOperationsPage({
          query: first(searchParams.q) ?? "",
          status: first(searchParams.status) ?? "all",
          page: Number(first(searchParams.page)) || 1,
        })
      : null;
  const checks = section === "discovery" ? await loadDiscoveryChecks() : [];

  return (
    <OperationsTabs value={section}>
      <AppShell
        admin
        breadcrumbSegmentLabels={{ operations: "Operations" }}
        currentBreadcrumbLabel="Catalogue"
        tabs={<OperationsTabList />}
      >
        <div className="flex w-full min-w-0 flex-col gap-4">
          <h1 className="sr-only">Catalogue operations</h1>
          {page ? <SyncList page={page} /> : <DiscoveryList checks={checks} />}
        </div>
      </AppShell>
    </OperationsTabs>
  );
}

export async function CatalogueSyncDetailPage({ syncId }: { syncId: string }) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const sync = await loadSyncDetail(syncId);
  if (!sync) notFound();
  return (
    <AppShell
      admin
      breadcrumbSegmentLabels={{ operations: "Operations", syncs: "Syncs" }}
      currentBreadcrumbLabel={sync.code}
    >
      <SyncDetailView sync={sync} />
    </AppShell>
  );
}

export async function CatalogueDiscoveryDetailPage({
  checkId,
}: {
  checkId: number;
}) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const check = await loadDiscoveryCheck(checkId);
  if (!check) notFound();
  return (
    <AppShell
      admin
      breadcrumbSegmentLabels={{
        operations: "Operations",
        discovery: "Discovery",
      }}
      currentBreadcrumbLabel={`${check.kind} ${check.academicYear}`}
    >
      <DiscoveryDetailView check={check} />
    </AppShell>
  );
}
