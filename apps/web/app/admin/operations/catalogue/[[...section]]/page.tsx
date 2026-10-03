import { notFound } from "next/navigation";
import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import {
  CatalogueDiscoveryDetailPage,
  CatalogueImportPage,
  CatalogueOperationsPage,
  CatalogueSyncDetailPage,
} from "@/ui/admin/operations/operations-pages";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: SearchParams;
}) {
  const { section = [] } = await params;
  if (section.length === 0) {
    return (
      <CatalogueOperationsPage
        section="syncs"
        searchParams={await searchParams}
      />
    );
  }
  if (
    section.length === 1 &&
    (section[0] === "discovery" || section[0] === "imports")
  ) {
    return (
      <CatalogueOperationsPage
        section={section[0]}
        searchParams={await searchParams}
      />
    );
  }
  if (section.length === 2 && section[0] === "imports") {
    const runId = section[1]!;
    if (runId !== "new" && !UUID.test(runId)) notFound();
    const query = await searchParams;
    const year = query.year === undefined ? undefined : Number(query.year);
    if (year !== undefined && !Number.isInteger(year)) notFound();
    return (
      <CatalogueImportPage
        runId={runId}
        kind={typeof query.kind === "string" ? query.kind : undefined}
        year={year}
        initialTab={typeof query.tab === "string" ? query.tab : undefined}
      />
    );
  }
  if (section.length === 2 && section[0] === "syncs") {
    if (!UUID.test(section[1]!)) notFound();
    return <CatalogueSyncDetailPage syncId={section[1]!} />;
  }
  if (section.length === 2 && section[0] === "discovery") {
    const checkId = Number(section[1]);
    if (!Number.isInteger(checkId) || checkId < 1) notFound();
    return <CatalogueDiscoveryDetailPage checkId={checkId} />;
  }
  notFound();
}
