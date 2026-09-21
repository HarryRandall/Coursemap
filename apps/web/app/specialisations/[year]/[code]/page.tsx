import { PublicCatalogueRecordPage } from "@/ui/catalogue/public-record-page";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ year: string; code: string }>;
}) {
  return <PublicCatalogueRecordPage kind="specialisation" {...await params} />;
}
