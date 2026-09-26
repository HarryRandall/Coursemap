import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

/**
 * Student home. Students without a primary plan see the dashboard empty state,
 * which offers onboarding, rather than being redirected into it.
 */
export default async function DashboardPage() {
  let data;
  try {
    const [catalogue, choices] = await Promise.all([
      loadCurrentUserPlanCatalogue(),
      loadOnboardingCatalogue(),
    ]);
    data = { catalogue, choices };
  } catch {
    return (
      <PlanningCatalogueError pageTitle="Dashboard" retryHref="/dashboard" />
    );
  }
  return <Dashboard {...data} />;
}
