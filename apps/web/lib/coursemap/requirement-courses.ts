import "server-only";
import { requirementLevelFilter } from "./requirement-course-filters";
import type { Course } from "@/lib/coursemap/types";
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
import { loadClosestCourseEditions } from "@/lib/coursemap/planning-course-editions";
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
  const level =
    requirementLevelFilter(condition.minimumLevel, condition.maximumLevel) ??
    undefined;
  if (
    ["subject_units", "level_units"].includes(condition.conditionKind) &&
    condition.subjectCode
  )
    return { subject: condition.subjectCode, level };
  if (condition.conditionKind === "tagged_units" && condition.tag)
    return { tag: condition.tag, level };
  return null;
}

/**
 * The courses a student's structures list, and a page of the courses each
 * subject or tag rule would count, so requirements can name and suggest
 * courses that are not in the plan yet. Only courses the catalogue lacks.
 * A listed course its year does not publish comes from the nearest year that
 * does; one no year publishes is left out.
 */
export async function loadRequirementCourses(
  catalogue: PlanCatalogue,
  { includeRuleCandidates = true }: { includeRuleCandidates?: boolean } = {},
): Promise<Course[]> {
  const academicYear = catalogue.academicYear;
  if (academicYear === null) return [];
  const known = (code: string, year = academicYear) =>
    catalogue.courses.some(
      (course) => course.code === code && course.year === year,
    );
  const codes = [
    ...new Set(
      catalogue.structureRequirements.flatMap((item) =>
        requirementCourseCodes(item.root),
      ),
    ),
  ].filter((code) => !known(code));
  const filters = (includeRuleCandidates ? catalogue.structureRequirements : [])
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
  const listedCodes = new Set(listed.map((course) => course.code));
  // A failed read of other years still leaves this year's courses.
  const fromOtherYears = await loadClosestCourseEditions(
    codes.filter((code) => !listedCodes.has(code)),
    academicYear,
  ).catch(() => []);
  return [
    ...new Map(
      [
        ...listed,
        ...fromOtherYears,
        ...pages.flatMap((page) => page?.courses ?? []),
      ]
        .filter(
          (course) =>
            !known(course.code) && !known(course.code, course.year),
        )
        .map((course) => [course.code, planCourseFromDetails(course)]),
    ).values(),
  ];
}

/** The plan catalogue with {@link loadRequirementCourses} added. */
export async function withRequirementCourses(
  catalogue: PlanCatalogue,
  options: { includeRuleCandidates?: boolean } = {},
): Promise<PlanCatalogue> {
  const added = await loadRequirementCourses(catalogue, options);
  return added.length
    ? { ...catalogue, courses: [...catalogue.courses, ...added] }
    : catalogue;
}
