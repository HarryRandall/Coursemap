import "server-only";
import type {
  CourseDetails,
  CourseRuleExpression,
} from "@/lib/coursemap/course-types";
import {
  loadPublishedCourse,
  loadPublishedCoursePage,
} from "@/lib/coursemap/published-courses";
import { completionPath, courseCodes } from "@/lib/coursemap/requisite-path";

/** The parts of a published course the requisite views need, as plain data. */
export type ShowcaseCourse = {
  code: string;
  name: string;
  year: number;
  /** Prerequisites, joined with any incompatibilities, for the table. */
  enrolmentRule: CourseRuleExpression;
  /** Prerequisites alone, for the graph. */
  prerequisiteRule: CourseRuleExpression | null;
  hasPrerequisiteWording: boolean;
  availableCourseCodes: string[];
  unlocks: { code: string; isAvailable: boolean }[];
  unlocksAreKnown: boolean;
};

/** Levels browsed for examples: undergraduate courses with real chains. */
const LEVELS = ["2", "3", "4"] as const;
const PAGES = 3;
const PAGE_SIZE = 100;
const SHOWN = 4;
/** A rule met in fewer steps than this makes a dull example. */
const MINIMUM_STEPS = 3;
/** Rules naming more courses than this are too tall to show whole. */
const MAXIMUM_CODES = 5;
/** Course details loaded to find the examples, from the longest lists. */
const DETAILED = 40;

/**
 * How likely a summary's rule is a chain rather than a list of options: an
 * "and" in its wording counts for more than any number of codes, since "one
 * of six courses" is met in one step.
 */
function chainScore(course: {
  prerequisiteCodes: string[];
  prerequisiteText: string;
}) {
  return (
    (/\band\b/iu.test(course.prerequisiteText) ? 100 : 0) +
    course.prerequisiteCodes.length
  );
}

/** The plain data the showcase needs from a published course, if it has a rule. */
export function showcaseCourse(course: CourseDetails): ShowcaseCourse | null {
  const prerequisiteRule =
    course.prerequisiteRule?.relationalExpression ?? null;
  const incompatibilityRule =
    course.incompatibilityRule?.relationalExpression ?? null;
  if (!prerequisiteRule) return null;
  return {
    code: course.code,
    name: course.name,
    year: course.year,
    enrolmentRule: incompatibilityRule
      ? {
          kind: "group",
          operator: "all_of",
          minimumCount: null,
          conditions: [prerequisiteRule, incompatibilityRule],
        }
      : prerequisiteRule,
    prerequisiteRule,
    hasPrerequisiteWording:
      course.prerequisiteText.trim().length > 0 &&
      !/^No prerequisites listed\.?$/iu.test(course.prerequisiteText.trim()),
    availableCourseCodes: course.availableCourseCodes,
    unlocks: course.prerequisiteEdges
      .filter((edge) => edge.from === course.code && edge.to !== course.code)
      .map((edge) => ({ code: edge.to, isAvailable: edge.toIsAvailable })),
    unlocksAreKnown: course.unlocksAreKnown,
  };
}

/**
 * Up to four published courses whose prerequisites take the most steps to
 * meet, at least three where the catalogue has them, from different
 * subjects where it can. Empty when none load.
 */
export async function loadLandingCourses(
  academicYear: number,
): Promise<ShowcaseCourse[]> {
  const pages = await Promise.all(
    LEVELS.flatMap((level) =>
      Array.from({ length: PAGES }, (_, index) =>
        loadPublishedCoursePage({
          academicYear,
          filters: { level },
          page: index + 1,
          pageSize: PAGE_SIZE,
        })
          .then((page) => page.courses)
          .catch(() => []),
      ),
    ),
  );
  // Summaries carry the codes a rule names but not the rule, so the courses
  // naming the most are loaded in full to measure their steps.
  const candidates = pages
    .flat()
    .filter((course) => course.prerequisiteCodes.length >= MINIMUM_STEPS)
    .sort(
      (left, right) =>
        chainScore(right) - chainScore(left) ||
        left.code.localeCompare(right.code),
    )
    .slice(0, DETAILED);
  const details = await Promise.all(
    candidates.map((course) =>
      loadPublishedCourse(course.code, academicYear).catch(() => null),
    ),
  );
  const ranked = details
    .flatMap((course) => {
      const item = course ? showcaseCourse(course) : null;
      if (!course || !item) return [];
      if (new Set(courseCodes(item.enrolmentRule)).size > MAXIMUM_CODES)
        return [];
      const steps = completionPath(item.prerequisiteRule, item.year).length;
      return [{ item, steps, subject: course.subject }];
    })
    .sort(
      (left, right) =>
        right.steps - left.steps ||
        left.item.code.localeCompare(right.item.code),
    );
  const long = ranked.filter((entry) => entry.steps >= MINIMUM_STEPS);
  const pool = long.length >= SHOWN ? long : ranked;
  // One course per subject first, then fill with the rest.
  const subjects = new Set<string>();
  const varied = pool.filter((entry) => {
    if (subjects.has(entry.subject)) return false;
    subjects.add(entry.subject);
    return true;
  });
  return [...varied, ...pool.filter((entry) => !varied.includes(entry))]
    .slice(0, SHOWN)
    .map((entry) => entry.item);
}

/** The examples for this year in Canberra; empty when none load. */
export function loadCurrentLandingCourses(): Promise<ShowcaseCourse[]> {
  const year = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric",
    }).format(new Date()),
  );
  return loadLandingCourses(year).catch(() => []);
}
