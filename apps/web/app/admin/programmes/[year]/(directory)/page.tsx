import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import { CatalogueYearRoute } from "@/ui/admin/catalogue/catalogue-route-pages";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: SearchParams;
}) {
  return (
    <CatalogueYearRoute
      kind="programme"
      year={(await params).year}
      searchParams={searchParams}
    />
  );
}
