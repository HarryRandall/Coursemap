import type { Attempt, Course, Term } from "@/lib/coursemap/types";
import type {
  PlanCatalogue,
  PlanStructureKind,
} from "@/lib/coursemap/plan-catalogue";
import {
  conditionHeading,
  conditionSummary,
  conditionTone,
  hidesCondition,
  listedCourseCounts,
  requirementRowStatus,
  type RequirementTreeCondition,
  type RequirementTreeGroup,
  type RequirementTreeNode,
  type TreeContext,
} from "@/ui/requirements/requirement-presentation";

export type PlannedStructure = {
  code: string;
  kind: PlanStructureKind;
  name: string;
  root: RequirementTreeGroup;
  context: TreeContext;
};

export type CourseToPlan = {
  course: Course;
  /** A compulsory course rather than one of several that would count. */
  required: boolean;
  /** A few words on the rule it counts towards, such as "COMP courses". */
  tag: string;
  structureKind: PlanStructureKind;
};

/**
 * Rules that still need courses, from the top of the tree down. The whole
 * structure reads as planned once its unit total is, so the root is always
 * opened; a group within it is skipped once it is planned or complete.
 */
function rulesToPlan(
  node: RequirementTreeNode,
  context: TreeContext,
  root = true,
): RequirementTreeCondition[] {
  if (node.type === "group") {
    return root || requirementRowStatus(node, context).kind === "todo"
      ? node.children.flatMap((child) => rulesToPlan(child, context, false))
      : [];
  }
  if (hidesCondition(node, context) || conditionTone(node) !== "requirement")
    return [];
  return requirementRowStatus(node, context).kind === "todo" ? [node] : [];
}

/** The version of a course to plan in a semester: that year's, or the latest. */
export function courseForTerm(
  code: string,
  term: Term,
  catalogue: PlanCatalogue,
): Course | undefined {
  const versions = catalogue.courses.filter((course) => course.code === code);
  return (
    versions.find((course) => course.year === term.year) ??
    versions.find((course) => course.year === catalogue.academicYear)
  );
}

/** One open rule with the courses the student has already settled on for it. */
export type RuleToPlan = {
  key: string;
  /** A few words, such as "COMP 3000+" or "Pick one". */
  heading: string;
  /** The rule in full, for a tooltip. */
  detail: string;
  /** What is left, such as "18 units to plan". */
  left: string;
  /** Share of the rule completed or planned, from 0 to 1. */
  progress: number;
  compulsory: boolean;
  /**
   * Compulsory courses still to place, or the options the student starred.
   * The planner never chooses between options on the student's behalf.
   */
  courses: CourseToPlan[];
  /** How many courses the rule lists to choose from; 0 when it names none. */
  options: number;
  /** Course directory filters for a rule that names no courses. */
  browse: string | null;
};

export type StructureToPlan = {
  structure: PlannedStructure;
  rules: RuleToPlan[];
  /** Rules already covered by completed or planned courses. */
  doneCount: number;
};

/**
 * The course search filters that list what a units rule would count: its
 * subject or tag, and its levels as the leading digit ("3+" for 3000 level
 * or above). Rules any course meets have none.
 */
function ruleSearchParams(rule: RequirementTreeCondition) {
  const digit = (level: number) => String(level < 10 ? level : level / 1000);
  const { minimumLevel, maximumLevel } = rule;
  const params = new URLSearchParams();
  if (rule.conditionKind === "subject_units" && rule.subjectCode)
    params.set("subject", rule.subjectCode);
  else if (rule.conditionKind === "tagged_units" && rule.tag)
    params.set("tag", rule.tag);
  else if (rule.conditionKind !== "level_units") return null;
  if (minimumLevel !== null)
    params.set(
      "level",
      minimumLevel === maximumLevel
        ? digit(minimumLevel)
        : `${digit(minimumLevel)}+`,
    );
  else if (maximumLevel !== null) params.set("level", digit(maximumLevel));
  return params.size > 0 ? params.toString() : null;
}

/** A rule named in a few words, so a list of them reads at a glance. */
function shortHeading(rule: RequirementTreeCondition, compulsory: boolean) {
  const level = rule.minimumLevel !== null ? ` ${rule.minimumLevel}+` : "";
  switch (rule.conditionKind) {
    case "subject_units":
      return rule.subjectCode
        ? level
          ? `${rule.subjectCode}${level}`
          : `${rule.subjectCode} courses`
        : "Subject courses";
    case "level_units":
      return rule.minimumLevel !== null
        ? `${rule.minimumLevel}-level courses`
        : "Course level";
    case "course_set_units": {
      if (compulsory) return "Compulsory";
      const count = rule.minimumCourses ?? 1;
      return count === 1 ? "Pick one" : `Pick ${count}`;
    }
    case "elective_units":
      return "Electives";
    default:
      return conditionHeading(rule);
  }
}

function requirementRules(
  node: RequirementTreeNode,
  context: TreeContext,
): RequirementTreeCondition[] {
  if (node.type === "group")
    return node.children.flatMap((child) => requirementRules(child, context));
  return !hidesCondition(node, context) && conditionTone(node) === "requirement"
    ? [node]
    : [];
}

/**
 * Each structure's open rules in requirement order, with the compulsory
 * courses still to place and any options the student starred. A course can
 * count for more than one structure, so it may appear under each of them.
 */
export function structuresToPlan({
  structures,
  attempts,
  catalogue,
  starred,
}: {
  structures: PlannedStructure[];
  attempts: Attempt[];
  catalogue: PlanCatalogue;
  /** Codes of the courses the student starred. */
  starred: readonly string[];
}): StructureToPlan[] {
  const planned = new Set(
    attempts
      .filter((attempt) => attempt.status !== "withdrawn")
      .map((attempt) => attempt.courseCode),
  );
  const starredCodes = new Set(starred);
  return structures.map((structure) => {
    const { context } = structure;
    const open = rulesToPlan(structure.root, context);
    const seen = new Set<string>();
    const rules = open.flatMap((rule): RuleToPlan[] => {
      const listed = listedCourseCounts(rule, context);
      const compulsory = listed.codes.length > 0 && listed.required;
      // A choice the student already made, counted under another rule,
      // is theirs to move rather than a reason to list the alternatives.
      if (
        !compulsory &&
        listed.codes.some((code) => context.attemptStatusByCode.has(code))
      )
        return [];
      const heading = shortHeading(rule, compulsory);
      const courses = listed.codes
        .filter((code) => compulsory || starredCodes.has(code))
        .flatMap((code) => {
          const course = catalogue.courses.find(
            (item) =>
              item.code === code && item.year === catalogue.academicYear,
          );
          return course ? [course] : [];
        })
        .filter((course) => !planned.has(course.code) && !seen.has(course.code))
        .map((course) => {
          seen.add(course.code);
          return {
            course,
            required: compulsory,
            tag: compulsory ? "Required" : heading,
            structureKind: structure.kind,
          };
        });
      const status = requirementRowStatus(rule, context);
      const figure = status.kind === "unmeasured" ? null : status.figure;
      return [
        {
          key: `${structure.code}:${rule.id}`,
          heading,
          detail: conditionSummary(rule),
          left: status.kind === "unmeasured" ? "" : status.label,
          progress:
            figure && figure.target > 0
              ? Math.min(1, figure.value / figure.target)
              : 0,
          compulsory,
          courses,
          options: listed.codes.length,
          browse: listed.codes.length > 0 ? null : ruleSearchParams(rule),
        },
      ];
    });
    const measured = requirementRules(structure.root, context).filter(
      (rule) => {
        const kind = requirementRowStatus(rule, context).kind;
        return kind === "planned" || kind === "complete";
      },
    );
    return { structure, rules, doneCount: measured.length };
  });
}
