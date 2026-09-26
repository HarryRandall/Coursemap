import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import {
  isPlanStructureKind,
  loadCurrentUserPlanCatalogue,
} from "@/lib/coursemap/plan-catalogue";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { withRequirementCourses } from "@/lib/coursemap/requirement-courses";
import { Requirements } from "./requirements";

export const dynamic = "force-dynamic";

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  let data;
  try {
    const [catalogue, choices] = await Promise.all([
      loadCurrentUserPlanCatalogue(),
      loadOnboardingCatalogue(),
    ]);
    data = {
      catalogue: await withRequirementCourses(catalogue),
      choices,
    };
  } catch {
    return (
      <PlanningCatalogueError
        pageTitle="Requirements"
        retryHref="/requirements"
      />
    );
  }

  return (
    <Requirements
      {...data}
      initialTab={tab && isPlanStructureKind(tab) ? tab : "programme"}
    />
  );
}
