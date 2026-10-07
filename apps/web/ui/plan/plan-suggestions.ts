import type { AttemptStatus, Course, Term } from "@/lib/coursemap/types";
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

/** A course a rule lists, and where it stands in the student's plan. */
export type RuleCourse = {
  code: string;
  /** Null when the catalogue year the plan uses does not publish it. */
  course: Course | null;
  /** Completed, planned or enrolled; null while it is not in the plan. */
  status: AttemptStatus | null;
};

/** One rule of a structure with the courses it lists, if any. */
export type RuleToPlan = {
  key: string;
  /** A few words, such as "Core courses" or "Pick one". */
  heading: string;
  /** The rule in full, for a tooltip. */
  detail: string;
  /** How far it has come, such as "6 / 30 units". */
  count: string;
  /** Share of the rule completed or planned, from 0 to 1. */
  progress: number;
  /** Whether the plan already covers the rule. */
  covered: boolean;
  compulsory: boolean;
  /** Every course the rule names. Rules counting units by filter name none. */
  courses: RuleCourse[];
  /** Course directory filters for a rule that names no courses. */
  browse: string | null;
  /**
   * A line on what counts, for a rule whose heading cannot say it, such as
   * a degree total that every course adds to.
   */
  note: string | null;
};

export type StructureToPlan = {
  structure: PlannedStructure;
  rules: RuleToPlan[];
  /** Rules the plan does not cover yet. */
  openCount: number;
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
      if (compulsory) return "Core courses";
      const count = rule.minimumCourses ?? 1;
      return count === 1 ? "Pick one" : `Pick ${count}`;
    }
    case "elective_units":
      return "Electives";
    case "units_total":
      return "Total units";
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
 * Each structure's rules in requirement order, with every course a rule
 * lists and whether it is in the plan, so required courses can be read and
 * added in one place. A total reads last, because every other rule fills it.
 */
export function structuresToPlan({
  structures,
  catalogue,
}: {
  structures: PlannedStructure[];
  catalogue: PlanCatalogue;
}): StructureToPlan[] {
  const courseFor = (code: string) =>
    catalogue.courses.find(
      (item) => item.code === code && item.year === catalogue.academicYear,
    ) ??
    catalogue.courses.find((item) => item.code === code) ??
    null;
  return structures.map((structure) => {
    const { context } = structure;
    const ordered = requirementRules(structure.root, context).sort(
      (left, right) =>
        Number(left.conditionKind === "units_total") -
        Number(right.conditionKind === "units_total"),
    );
    const rules = ordered.map((rule): RuleToPlan => {
      const listed = listedCourseCounts(rule, context);
      const compulsory = listed.codes.length > 0 && listed.required;
      const status = requirementRowStatus(rule, context);
      const figure = status.kind === "unmeasured" ? null : status.figure;
      return {
        key: `${structure.code}:${rule.id}`,
        heading: shortHeading(rule, compulsory),
        detail: conditionSummary(rule),
        count: figure
          ? `${Math.min(figure.value, figure.target)} / ${figure.target} ${figure.unit}`
          : "",
        progress:
          figure && figure.target > 0
            ? Math.min(1, figure.value / figure.target)
            : 0,
        covered: status.kind === "planned" || status.kind === "complete",
        compulsory,
        courses: listed.codes.map((code) => ({
          code,
          course: courseFor(code),
          status: context.attemptStatusByCode.get(code) ?? null,
        })),
        browse: listed.codes.length > 0 ? null : ruleSearchParams(rule),
        note:
          rule.conditionKind === "units_total"
            ? "Every course counts here, core and elective alike, so the rules above fill it as you plan."
            : null,
      };
    });
    return {
      structure,
      rules,
      openCount: rules.filter((rule) => !rule.covered).length,
    };
  });
}
