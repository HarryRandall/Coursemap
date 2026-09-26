import "server-only";
import {
  planCourseFromDetails,
  type PlanCatalogue,
  type PlanRequirementCondition,
  type PlanRequirementNode,
} from "@/lib/coursemap/plan-catalogue";
import {
  loadPublishedCoursePage,
  loadPublishedCoursesByCodes,
} from "@/lib/coursemap/published-courses";
import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";

/** Candidate courses fetched for each rule that counts units by filter. */
const CANDIDATES_PER_RULE = 12;
const RULES_SEARCHED = 12;

function unitConditions(
  node: PlanRequirementNode | null,
): PlanRequirementCondition[] {
  if (!node) return [];
  if (node.type === "group") return node.children.flatMap(unitConditions);
  return node.minimumUnits !== null ? [node] : [];
}

/**
 * The course search filters that list what a units rule would count: its
 * subject or tag, and its levels as the leading digit ("3+" for 3000 level
 * or above). Rules any course meets have no useful filter.
 */
function searchFilters(condition: PlanRequirementCondition) {
  const digit = (level: number) => String(level < 10 ? level : level / 1000);
  const { minimumLevel, maximumLevel } = condition;
  const level =
    minimumLevel !== null
      ? minimumLevel === maximumLevel
        ? digit(minimumLevel)
        : `${digit(minimumLevel)}+`
      : maximumLevel !== null
        ? digit(maximumLevel)
        : undefined;
  if (condition.conditionKind === "subject_units" && condition.subjectCode)
    return { subject: condition.subjectCode, level };
  if (condition.conditionKind === "tagged_units" && condition.tag)
    return { tag: condition.tag, level };
  return null;
}

/**
 * The plan catalogue with the courses the student's structures list, and a
 * page of the courses each subject or tag rule would count, so requirements
 * can name and suggest courses that are not in the plan yet.
 */
export async function withRequirementCourses(
  catalogue: PlanCatalogue,
): Promise<PlanCatalogue> {
  const academicYear = catalogue.academicYear;
  if (academicYear === null) return catalogue;
  const known = (code: string) =>
    catalogue.courses.some(
      (course) => course.code === code && course.year === academicYear,
    );
  const codes = [
    ...new Set(
      catalogue.structureRequirements.flatMap((item) =>
        requirementCourseCodes(item.root),
      ),
    ),
  ].filter((code) => !known(code));
  const filters = catalogue.structureRequirements
    .flatMap((item) => unitConditions(item.root))
    .flatMap((condition) => {
      const filter = searchFilters(condition);
      return filter ? [filter] : [];
    })
    .filter(
      (filter, index, all) =>
        all.findIndex(
          (other) => JSON.stringify(other) === JSON.stringify(filter),
        ) === index,
    )
    .slice(0, RULES_SEARCHED);
  const [listed, ...pages] = await Promise.all([
    loadPublishedCoursesByCodes(codes, academicYear),
    ...filters.map((filter) =>
      loadPublishedCoursePage({
        academicYear,
        filters: filter,
        pageSize: CANDIDATES_PER_RULE,
      }).catch(() => null),
    ),
  ]);
  const added = new Map(
    [...listed, ...pages.flatMap((page) => page?.courses ?? [])]
      .filter((course) => !known(course.code))
      .map((course) => [course.code, planCourseFromDetails(course)]),
  );
  return {
    ...catalogue,
    courses: [...catalogue.courses, ...added.values()],
  };
}
