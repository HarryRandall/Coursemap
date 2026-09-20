import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import { CatalogueImportsPage } from "@/ui/admin/catalogue/catalogue-pages";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <CatalogueImportsPage kind="programme" searchParams={searchParams} />;
}
