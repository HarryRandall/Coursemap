import "server-only";
import {
  planCourseFromDetails,
  type PlanCatalogue,
} from "@/lib/coursemap/plan-catalogue";
import { loadPublishedCoursesByCodes } from "@/lib/coursemap/published-courses";
import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";

/**
 * The plan catalogue with every course the student's structures list, so
 * requirements can name and suggest courses that are not in the plan yet.
 */
export async function withRequirementCourses(
  catalogue: PlanCatalogue,
): Promise<PlanCatalogue> {
  if (catalogue.academicYear === null) return catalogue;
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
  const courses = await loadPublishedCoursesByCodes(
    codes,
    catalogue.academicYear,
  );
  return {
    ...catalogue,
    courses: [...catalogue.courses, ...courses.map(planCourseFromDetails)],
  };
}
