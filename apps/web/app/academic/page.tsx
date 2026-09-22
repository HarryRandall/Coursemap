import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { AcademicRecord } from "./academic-record";

export const dynamic = "force-dynamic";

export default async function AcademicPage() {
  let catalogue;
  try {
    catalogue = await loadCurrentUserPlanCatalogue();
  } catch {
    return (
      <PlanningCatalogueError
        pageTitle="Academic history"
        retryHref="/academic"
      />
    );
  }
  return <AcademicRecord catalogue={catalogue} />;
}
