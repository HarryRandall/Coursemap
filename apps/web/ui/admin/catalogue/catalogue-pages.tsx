import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import {
  CATALOGUE_KIND_LABELS,
  CATALOGUE_STATE_LABELS,
  type CatalogueKind,
  type CatalogueRecordState,
  loadCatalogueDirectoryPage,
} from "@/lib/coursemap/admin-catalogue";
import { AppShell } from "@/ui/shell";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { CatalogueDirectory } from "./catalogue-directory";

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** An unknown state in the query string narrows to nothing, so it is dropped. */
function recordState(value: string | undefined) {
  return value && value in CATALOGUE_STATE_LABELS
    ? (value as CatalogueRecordState)
    : null;
}

/** The directory page for one kind; each route file calls this with its kind. */
export async function CatalogueDirectoryPage({
  kind,
  academicYear,
  searchParams,
}: {
  kind: CatalogueKind;
  academicYear: number;
  searchParams: SearchParams;
}) {
  if (!(await canManageCatalogueOperations())) return <AccessDeniedError />;
  const params = await searchParams;
  const labels = CATALOGUE_KIND_LABELS[kind];
  const page = await loadCatalogueDirectoryPage({
    kind,
    academicYear,
    query: first(params.q) ?? "",
    state: recordState(first(params.state)),
    page: Number(first(params.page)) || 1,
  });
  return (
    <AppShell
      admin
      fill
      breadcrumbSegmentLabels={{ [String(academicYear)]: null }}
    >
      <h1 className="sr-only">{labels.plural}</h1>
      <CatalogueDirectory page={page} />
    </AppShell>
  );
}
