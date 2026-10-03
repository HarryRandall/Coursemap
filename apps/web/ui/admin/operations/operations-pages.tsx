import { isBulkImportKind } from "@/lib/catalogue-runs/kinds";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  readCourseRunHistory,
  readCourseRuns,
} from "@/lib/catalogue-runs/service";
import {
  loadCatalogueYears,
  defaultCatalogueYear,
} from "@/lib/coursemap/admin-catalogue";
import { CourseImportWorkspace } from "@/ui/admin/catalogue/course-import-workspace";
import { CourseImportList } from "./course-import-list";
import {
  canManageCatalogueOperations,
  canWriteCourses,
  canWriteCatalogue,
  getAuthViewer,
} from "@/lib/auth/viewer";
import {
  loadDiscoveryCheck,
  loadDiscoveryChecks,
  loadSyncDetail,
  loadSyncOperationsPage,
  loadCatalogueProviderState,
} from "@/lib/coursemap/admin-operations";
import { CatalogueTableLoading } from "@/ui/admin/catalogue-table/catalogue-loading";
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
import { SyncDetailTabList, SyncDetailTabs } from "./sync-detail-tabs";
import { SyncList } from "./sync-list";
import { ProviderRecovery } from "./provider-recovery";

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
      ? loadSyncOperationsPage({
          query: first(searchParams.q) ?? "",
          status: first(searchParams.status) ?? "all",
          page: Number(first(searchParams.page)) || 1,
        })
      : null;
  const requestedImportPage = Number(first(searchParams.page));
  const imports =
    section === "imports"
      ? readCourseRunHistory(
          Number.isSafeInteger(requestedImportPage) && requestedImportPage > 0
            ? requestedImportPage
            : 1,
          {
            query: first(searchParams.q),
            status: first(searchParams.status),
            kind: first(searchParams.kind),
            year: /^\d{4}$/u.test(first(searchParams.year) ?? "")
              ? Number(first(searchParams.year))
              : undefined,
          },
        )
      : null;
  const checks = section === "discovery" ? loadDiscoveryChecks() : null;

  return (
    <OperationsTabs value={section}>
      <AppShell
        admin
        fill
        breadcrumbSegmentLabels={{ operations: null, imports: "Bulk imports" }}
        currentBreadcrumbLabel={section === "syncs" ? "Catalogue" : undefined}
        breadcrumbTrailingLabel={section === "syncs" ? "Syncs" : undefined}
        breadcrumbTrailingIcon={section === "syncs" ? "syncs" : undefined}
        tabs={<OperationsTabList />}
      >
        <h1 className="sr-only">Catalogue activity</h1>
        <Suspense
          fallback={
            <CatalogueTableLoading
              layout={
                section === "syncs"
                  ? "operations-syncs"
                  : section === "imports"
                    ? "operations-imports"
                    : "operations-discovery"
              }
              noun={
                section === "syncs"
                  ? "Record"
                  : section === "imports"
                    ? "Import"
                    : "Listing"
              }
            />
          }
        >
          {imports ? (
            <ImportsContent history={imports} />
          ) : page ? (
            <SyncsContent page={page} />
          ) : (
            <DiscoveryContent checks={checks!} />
          )}
        </Suspense>
      </AppShell>
    </OperationsTabs>
  );
}

async function SyncsContent({
  page,
}: {
  page: ReturnType<typeof loadSyncOperationsPage>;
}) {
  const [loadedPage, provider] = await Promise.all([
    page,
    loadCatalogueProviderState(),
  ]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ProviderRecovery state={provider} />
      <SyncList page={loadedPage} />
    </div>
  );
}

async function DiscoveryContent({
  checks,
}: {
  checks: ReturnType<typeof loadDiscoveryChecks>;
}) {
  return <DiscoveryList checks={await checks} />;
}

export async function CatalogueSyncDetailPage({ syncId }: { syncId: string }) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const sync = await loadSyncDetail(syncId);
  if (!sync) notFound();
  return (
    <SyncDetailTabs>
      <AppShell
        admin
        breadcrumbSegmentLabels={{ operations: null, syncs: "Syncs" }}
        currentBreadcrumbLabel={sync.code}
        tabs={
          <SyncDetailTabList
            stageCount={sync.stages.length}
            extractionCount={sync.extractions.length}
            artefactCount={sync.artefacts.length}
            failedStageCount={
              sync.stages.filter((stage) => stage.status === "failed").length
            }
          />
        }
      >
        <SyncDetailView sync={sync} />
      </AppShell>
    </SyncDetailTabs>
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
        operations: null,
        discovery: "Discovery",
      }}
      currentBreadcrumbLabel={`${check.kind} ${check.academicYear}`}
    >
      <DiscoveryDetailView check={check} />
    </AppShell>
  );
}

async function ImportsContent({
  history,
}: {
  history: ReturnType<typeof readCourseRunHistory>;
}) {
  const [loaded, years] = await Promise.all([history, loadCatalogueYears()]);
  return (
    <CourseImportList
      history={loaded}
      years={years}
      year={await defaultCatalogueYear("course", years)}
    />
  );
}

export async function CatalogueImportPage({
  runId,
  year,
  initialTab,
  kind: requestedKind,
}: {
  runId: string;
  year?: number;
  initialTab?: string;
  kind?: string;
}) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const run =
    runId === "new" ? null : (await readCourseRuns(undefined, { runId }))[0];
  if (runId !== "new" && !run) notFound();
  const kind = run?.kind ?? requestedKind ?? "course";
  if (!isBulkImportKind(kind)) notFound();
  const years = await loadCatalogueYears();
  const selectedYear =
    run?.academic_year ?? year ?? (await defaultCatalogueYear(kind, years));
  if (!selectedYear || !years.includes(selectedYear)) notFound();
  const [canPublish, viewer] = await Promise.all([
    kind === "course" ? canWriteCourses() : canWriteCatalogue(),
    getAuthViewer(),
  ]);
  return (
    <CourseImportWorkspace
      key={`${runId}-${selectedYear}-${kind}`}
      kind={kind}
      years={years}
      year={selectedYear}
      initialRun={run ?? null}
      initialTab={initialTab}
      canPublish={canPublish}
      canChangeAutoPublish={
        canPublish && (!run || run.requested_by === viewer?.id)
      }
    />
  );
}
