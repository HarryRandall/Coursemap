import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import { CatalogueImportRunsPage } from "@/ui/admin/catalogue/catalogue-pages";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <CatalogueImportRunsPage kind="major" searchParams={searchParams} />;
}
