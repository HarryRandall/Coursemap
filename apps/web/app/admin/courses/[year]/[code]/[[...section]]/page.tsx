import { CatalogueRecordRoute } from "@/ui/admin/catalogue/catalogue-route-pages";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ year: string; code: string; section?: string[] }>;
}) {
  return <CatalogueRecordRoute kind="course" {...await params} />;
}
