import { withPlanningState } from "@/ui/plan/planning-page";
import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { withRequirementCourses } from "@/lib/coursemap/requirement-courses";
import { PlanClient } from "./plan-client";

export const dynamic = "force-dynamic";

async function PlanPage() {
  let catalogue;
  try {
    catalogue = await withRequirementCourses(
      await loadCurrentUserPlanCatalogue(),
    );
  } catch {
    return <PlanningCatalogueError pageTitle="Planner" retryHref="/plan" />;
  }
  return <PlanClient catalogue={catalogue} />;
}

export default withPlanningState(PlanPage);
