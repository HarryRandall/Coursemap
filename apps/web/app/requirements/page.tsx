import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import {
  isPlanStructureKind,
  loadCurrentUserPlanCatalogue,
  planCourseFromDetails,
} from "@/lib/coursemap/plan-catalogue";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { loadPublishedCoursesByCodes } from "@/lib/coursemap/published-courses";
import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";
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
    const codes = [
      ...new Set(
        catalogue.structureRequirements.flatMap((item) =>
          requirementCourseCodes(item.root),
        ),
      ),
    ].filter(
      (code) =>
        !catalogue.courses.some(
          (course) =>
            course.code === code && course.year === catalogue.academicYear,
        ),
    );
    const courses =
      catalogue.academicYear !== null
        ? await loadPublishedCoursesByCodes(codes, catalogue.academicYear)
        : [];
    data = {
      catalogue: {
        ...catalogue,
        courses: [...catalogue.courses, ...courses.map(planCourseFromDetails)],
      },
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
