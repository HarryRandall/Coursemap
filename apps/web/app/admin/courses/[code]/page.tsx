import type { SearchParams } from "@/ui/admin/catalogue/catalogue-pages";
import { CatalogueRecordPage } from "@/ui/admin/catalogue/record-page";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: SearchParams;
}) {
  const { code } = await params;
  return (
    <CatalogueRecordPage
      kind="course"
      code={code}
      searchParams={searchParams}
    />
  );
}
