import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import { CatalogueRecordRoute } from "@/ui/admin/catalogue/catalogue-route-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; code: string; section?: string[] }>;
  searchParams: SearchParams;
}) {
  return (
    <CatalogueRecordRoute
      searchParams={searchParams}
      kind="course"
      {...await params}
    />
  );
}
