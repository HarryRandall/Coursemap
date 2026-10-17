import { withPlanningState } from "@/ui/plan/planning-page";
import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { loadRequirementCourses } from "@/lib/coursemap/requirement-courses";
import { PlanClient } from "./plan-client";

export const dynamic = "force-dynamic";

async function PlanPage() {
  let catalogue;
  try {
    catalogue = await loadCurrentUserPlanCatalogue();
  } catch {
    return <PlanningCatalogueError pageTitle="Planner" retryHref="/plan" />;
  }
  // Suggestions stream in after the board renders. Without them the board
  // still works, so a failed read leaves them out rather than failing the page.
  const requirementCourses = loadRequirementCourses(catalogue).catch(() => []);
  return (
    <PlanClient catalogue={catalogue} requirementCourses={requirementCourses} />
  );
}

export default withPlanningState(PlanPage);
