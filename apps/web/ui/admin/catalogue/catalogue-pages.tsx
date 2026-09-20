import { Suspense } from "react";
import { canManageCourseImports } from "@/lib/auth/viewer";
import {
  CATALOGUE_KIND_LABELS,
  DEFAULT_IMPORT_RUN_SORT,
  IMPORT_RUN_SORTS,
  type CatalogueKind,
  type DirectoryFilter,
  type ImportRunProgress,
  type ImportRunSort,
  type ImportTargetDetail,
  adminCataloguePath,
  defaultCatalogueYear,
  loadCatalogueDirectoryPage,
  loadCatalogueImportRuns,
  loadCatalogueYears,
  loadImportRunProgress,
  loadImportTargetDetail,
} from "@/lib/coursemap/admin-catalogue";
import { AppShell } from "@/ui/shell";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import {
  CatalogueTableLoading,
  ImportRunsSkeleton,
} from "@/ui/admin/catalogue-table/catalogue-loading";
import { CatalogueDirectory } from "./catalogue-directory";
import { CatalogueTabs } from "./catalogue-tabs";
import { ImportRuns } from "./import-runs";

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tabsFor(kind: CatalogueKind) {
  const base = adminCataloguePath(kind);
  return (
    <CatalogueTabs
      label={`${CATALOGUE_KIND_LABELS[kind].singular} sections`}
      tabs={[
        { href: base, label: "Directory" },
        { href: `${base}/imports`, label: "Import runs" },
      ]}
    />
  );
}

/** The directory page for one kind; each route file calls this with its kind. */
export async function CatalogueDirectoryPage({
  kind,
  searchParams,
}: {
  kind: CatalogueKind;
  searchParams: SearchParams;
}) {
  if (!(await canManageCourseImports())) return <AccessDeniedError />;
  const params = await searchParams;
  const years = await loadCatalogueYears();
  const requestedYear = Number(first(params.year));
  const academicYear = years.includes(requestedYear)
    ? requestedYear
    : await defaultCatalogueYear(kind, years);
  const labels = CATALOGUE_KIND_LABELS[kind];
  const page = loadCatalogueDirectoryPage({
    kind,
    academicYear,
    query: first(params.q) ?? "",
    filter: (first(params.status) as DirectoryFilter | undefined) ?? "all",
    page: Number(first(params.page)) || 1,
  });
  return (
    <AppShell
      admin
      fill
      tabs={tabsFor(kind)}
      currentBreadcrumbLabel={labels.plural}
    >
      <h1 className="sr-only">{labels.plural}</h1>
      <Suspense
        fallback={
          <CatalogueTableLoading noun={labels.plural} layout="directory" />
        }
      >
        <DirectoryContent page={page} kind={kind} />
      </Suspense>
    </AppShell>
  );
}

async function DirectoryContent({
  page,
  kind,
}: {
  page: ReturnType<typeof loadCatalogueDirectoryPage>;
  kind: CatalogueKind;
}) {
  const resolved = await page;
  return (
    <CatalogueDirectory
      page={resolved}
      basePath={adminCataloguePath(kind)}
      importsEnabled
    />
  );
}

export async function CatalogueImportRunsPage({
  kind,
  searchParams,
}: {
  kind: CatalogueKind;
  searchParams: SearchParams;
}) {
  if (!(await canManageCourseImports())) return <AccessDeniedError />;
  const params = await searchParams;
  const labels = CATALOGUE_KIND_LABELS[kind];
  const requestedSort = first(params.sort) as ImportRunSort | undefined;
  const runs = loadCatalogueImportRuns({
    kind,
    query: first(params.q) ?? "",
    status: first(params.status) ?? "",
    sort:
      requestedSort && IMPORT_RUN_SORTS.includes(requestedSort)
        ? requestedSort
        : DEFAULT_IMPORT_RUN_SORT,
    page: Number(first(params.page)) || 1,
    selectedRunId: first(params.run) ?? null,
  });
  async function loadTarget(targetId: string) {
    "use server";
    if (!(await canManageCourseImports())) return null;
    return loadImportTargetDetail(targetId);
  }
  async function readRunProgress(runId: string) {
    "use server";
    if (!(await canManageCourseImports())) return null;
    return loadImportRunProgress(runId);
  }
  return (
    <AppShell
      admin
      fill
      tabs={tabsFor(kind)}
      currentBreadcrumbLabel="Import runs"
      breadcrumbSegmentLabels={{ [labels.segment]: labels.plural }}
    >
      <h1 className="sr-only">{labels.singular} import runs</h1>
      <Suspense fallback={<ImportRunsSkeleton />}>
        <ImportRunsContent
          runs={runs}
          kind={kind}
          loadTarget={loadTarget}
          readRunProgress={readRunProgress}
        />
      </Suspense>
    </AppShell>
  );
}

async function ImportRunsContent({
  runs,
  kind,
  loadTarget,
  readRunProgress,
}: {
  runs: ReturnType<typeof loadCatalogueImportRuns>;
  kind: CatalogueKind;
  loadTarget: (targetId: string) => Promise<ImportTargetDetail | null>;
  readRunProgress: (runId: string) => Promise<ImportRunProgress | null>;
}) {
  return (
    <ImportRuns
      page={await runs}
      basePath={adminCataloguePath(kind)}
      kind={kind}
      loadTarget={loadTarget}
      readRunProgress={readRunProgress}
    />
  );
}
