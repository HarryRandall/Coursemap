import { withPlanningState } from "@/ui/plan/planning-page";
import { PublicCatalogueRecordPage } from "@/ui/catalogue/public-record-page";
export const dynamic = "force-dynamic";
async function Page({
  params,
}: {
  params: Promise<{ year: string; code: string }>;
}) {
  return <PublicCatalogueRecordPage kind="course" {...await params} />;
}

export default withPlanningState(Page);
