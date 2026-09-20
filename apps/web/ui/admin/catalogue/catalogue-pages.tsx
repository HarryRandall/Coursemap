import { Suspense } from "react";
import { canManageCourseImports } from "@/lib/auth/viewer";
import {
  CATALOGUE_KIND_LABELS,
  type CatalogueKind,
  type DirectoryFilter,
  adminCataloguePath,
  defaultCatalogueYear,
  loadCatalogueDirectoryPage,
  loadCatalogueImportRuns,
  loadCatalogueYears,
  loadImportTargetDetail,
} from "@/lib/coursemap/admin-catalogue";
import { AppShell } from "@/ui/shell";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { CatalogueTableLoading } from "@/ui/admin/catalogue-table/catalogue-loading";
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
}: {
  kind: CatalogueKind;
}) {
  if (!(await canManageCourseImports())) return <AccessDeniedError />;
  const labels = CATALOGUE_KIND_LABELS[kind];
  const runs = await loadCatalogueImportRuns({ kind });
  async function loadTarget(targetId: string) {
    "use server";
    if (!(await canManageCourseImports())) return null;
    return loadImportTargetDetail(targetId);
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
      <Suspense
        fallback={
          <CatalogueTableLoading
            noun="import records"
            layout="import-targets"
          />
        }
      >
        <ImportRuns
          runs={runs}
          basePath={adminCataloguePath(kind)}
          kind={kind}
          loadTarget={loadTarget}
        />
      </Suspense>
    </AppShell>
  );
}
