import { notFound } from "next/navigation";
import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import {
  CatalogueDiscoveryDetailPage,
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
  if (section.length === 1 && section[0] === "discovery") {
    return (
      <CatalogueOperationsPage
        section="discovery"
        searchParams={await searchParams}
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
