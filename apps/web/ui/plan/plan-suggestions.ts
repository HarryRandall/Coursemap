import {
  boundedRequirement,
  requirementCourseParams,
} from "@/lib/coursemap/requirement-course-filters";
import {
  conditionTone,
  hidesCondition,
} from "@/lib/coursemap/requirement-classification";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { requirementTitle } from "@/lib/coursemap/requirement-titles";
import { closestCourseEdition } from "@/lib/coursemap/course-edition-year";
import type { PlanPrerequisites } from "@/lib/coursemap/term-placement";
import type { AttemptStatus, Course, Term } from "@/lib/coursemap/types";
import type {
  PlanCatalogue,
  PlanStructureKind,
} from "@/lib/coursemap/plan-catalogue";
import {
  conditionHeading,
  courseSearchHref,
  conditionSummary,
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
  /**
   * The plan year's edition, or the nearest year's when that year does not
   * publish it. Null when the catalogue holds no edition at all.
   */
  course: Course | null;
  /** Completed, planned or enrolled; null while it is not in the plan. */
  status: AttemptStatus | null;
};

/** One rule of a structure with the courses it lists, if any. */
export type RuleToPlan = {
  key: string;
  requirementKey?: string;
  overridden?: boolean;
  /** A few words, such as "Core courses" or "Pick one". */
  heading: string;
  /** The rule in full, for a tooltip. */
  detail: string;
  /** How far it has come, such as "6 / 30 units". */
  count: string;
  /** Share of the rule completed or planned, from 0 to 1. */
  progress: number;
  /** Completed and planned amounts against the target, in the rule's own unit. */
  bar: { completed: number; planned: number; target: number } | null;
  /** What the rule still needs in a few words, such as "6 units left". Null once covered. */
  left: string | null;
  /** How many of the listed courses to choose, for a rule that offers a choice. */
  choice: number | null;
  /** Whether the plan already covers the rule. */
  covered: boolean;
  compulsory: boolean;
  /** Every course the rule names. Rules counting units by filter name none. */
  courses: RuleCourse[];
  remainingCourses: number;
  estimatedCount: boolean;
  /**
   * A degree total or electives rule that every other course also fills,
   * so its remaining courses overlap the other rules' rather than add to them.
   */
  catchAll: boolean;
  options?: RuleToPlan[];
  /** Course directory filters for a rule that names no courses. */
  browse: string | null;
  /**
   * The courses a tag or subject rule matches, loaded when it opens, with
   * where each stands in the plan. Null for a rule that lists its courses or
   * that any course fills.
   */
  matching: {
    query: string;
    statusByCode: ReadonlyMap<string, AttemptStatus>;
  } | null;
  /**
   * A line on what counts, for a rule whose heading cannot say it, such as
   * a degree total that every course adds to.
   */
  note: string | null;
};

export type StructureToPlan = {
  structure: PlannedStructure;
  rules: RuleToPlan[];
  /** Courses still to pick across open rules. */
  openCount: number;
  estimatedCount: boolean;
};

/**
 * Courses still to pick for a structure. Specific rules add up, but a total
 * or electives rule is filled by those same courses, so it only raises the
 * count when it needs more than the specific rules do.
 */
export function openCourseCount(
  rules: readonly Pick<
    RuleToPlan,
    "covered" | "catchAll" | "remainingCourses"
  >[],
) {
  const open = rules.filter((rule) => !rule.covered);
  const specific = open
    .filter((rule) => !rule.catchAll)
    .reduce((sum, rule) => sum + rule.remainingCourses, 0);
  const overall = Math.max(
    0,
    ...open
      .filter((rule) => rule.catchAll)
      .map((rule) => rule.remainingCourses),
  );
  return Math.max(specific, overall);
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
      const count = rule.minimumCourses;
      return count !== null
        ? count === 1
          ? "Pick one"
          : `Pick ${count}`
        : rule.minimumUnits !== null
          ? `Pick ${rule.minimumUnits} units`
          : "Pick courses";
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
): RequirementTreeNode[] {
  if (node.type === "group") {
    if (node.operator !== "all_of") return [node];
    return node.children.flatMap((child) => requirementRules(child, context));
  }
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
    closestCourseEdition(catalogue.courses, code, catalogue.academicYear) ??
    null;
  return structures.map((structure) => {
    const { context } = structure;
    const ordered = requirementRules(structure.root, context).sort(
      (left, right) =>
        Number(
          left.type === "condition" && left.conditionKind === "units_total",
        ) -
        Number(
          right.type === "condition" && right.conditionKind === "units_total",
        ),
    );
    const toRule = (rule: RequirementTreeNode): RuleToPlan => {
      if (rule.type === "group") {
        const options = rule.children
          .filter((child) => requirementRules(child, context).length > 0)
          .map(toRule);
        // A choice with one option left to plan, such as COMP units beside
        // majors the planner cannot list, is simply that option.
        if (options.length === 1) return options[0]!;
        const status = requirementRowStatus(rule, context);
        const covered = status.kind === "planned" || status.kind === "complete";
        const required =
          rule.operator === "any_of"
            ? 1
            : rule.operator === "at_least"
              ? (rule.minimumCount ?? 1)
              : options.length;
        const coveredOptions = options.filter(
          (option) => option.covered,
        ).length;
        const remaining = options
          .filter((option) => !option.covered)
          .sort((a, b) => a.remainingCourses - b.remainingCourses)
          .slice(0, Math.max(0, required - coveredOptions));
        return {
          key: `${structure.code}:group:${rule.id}`,
          heading:
            rule.operator === "any_of"
              ? "Pick one option"
              : rule.operator === "at_least"
                ? `Pick ${required} options`
                : "Take this option",
          detail: rule.sourceText ?? "Choose courses from the options below",
          count: "",
          progress: covered ? 1 : 0,
          bar: null,
          choice: null,
          left: covered
            ? null
            : `Choose ${Math.max(1, required - coveredOptions)}`,
          covered,
          compulsory: false,
          catchAll: false,
          courses: [],
          options,
          remainingCourses: covered
            ? 0
            : remaining.reduce(
                (sum, option) => sum + option.remainingCourses,
                0,
              ),
          estimatedCount: remaining.some((option) => option.estimatedCount),
          browse: null,
          matching: null,
          note: null,
        };
      }
      const listed = listedCourseCounts(rule, context);
      const fixedUnits = listed.codes
        .map((code) => courseFor(code))
        .map((course) =>
          course && (!course.unitValue || course.unitValue.kind === "fixed")
            ? course.units
            : null,
        );
      const takesAllUnits =
        rule.minimumUnits !== null &&
        !rule.includesAnyCourse &&
        fixedUnits.length > 0 &&
        fixedUnits.every((units) => units !== null && units > 0) &&
        fixedUnits.reduce<number>((sum, units) => sum + (units ?? 0), 0) ===
          rule.minimumUnits;
      const compulsory =
        listed.codes.length > 0 && (listed.required || takesAllUnits);
      const status = requirementRowStatus(rule, context);
      const figure = status.kind === "unmeasured" ? null : status.figure;
      const covered = status.kind === "planned" || status.kind === "complete";
      const measured = context.progress.get(requirementNodeKey(rule));
      const bar = figure
        ? figure.unit === "courses"
          ? {
              completed: listed.done,
              planned: listed.planned,
              target: figure.target,
            }
          : {
              completed: measured?.completedUnits ?? 0,
              planned: measured?.plannedUnits ?? 0,
              target: figure.target,
            }
        : null;
      const shortfall = figure ? Math.max(0, figure.target - figure.value) : 0;
      const choice =
        !compulsory && listed.codes.length > 0 ? rule.minimumCourses : null;
      const left =
        covered || !figure || shortfall === 0
          ? null
          : choice !== null && figure.unit === "courses"
            ? `Choose ${shortfall}`
            : figure.unit === "courses"
              ? `${shortfall} ${shortfall === 1 ? "course" : "courses"} left`
              : `${shortfall} units left`;
      const courses = listed.codes.map((code) => ({
        code,
        course: courseFor(code),
        status: context.attemptStatusByCode.get(code) ?? null,
      }));
      const remainingUnits =
        figure?.unit === "units"
          ? Math.max(0, figure.target - figure.value)
          : rule.minimumUnits;
      const estimatedCount =
        !compulsory &&
        rule.minimumCourses === null &&
        (figure?.unit === "units" || remainingUnits !== null);
      const remainingCourses = covered
        ? 0
        : compulsory && listed.outstanding.length > 0
          ? listed.outstanding.length
          : figure
            ? Math.ceil(
                Math.max(0, figure.target - figure.value) /
                  (figure.unit === "units" ? 6 : 1),
              )
            : rule.minimumCourses !== null
              ? Math.max(0, rule.minimumCourses - listed.done - listed.planned)
              : remainingUnits !== null
                ? Math.ceil(remainingUnits / 6)
                : 0;
      return {
        key: `${structure.code}:${rule.id}`,
        requirementKey: rule.projectionKey,
        overridden:
          status.kind === "complete" && status.label === "Marked satisfied",
        heading:
          listed.done === 0 &&
          listed.planned === 0 &&
          (!figure || figure.value === 0)
            ? (requirementTitle(
                rule,
                catalogue.courses.filter(
                  (course) => course.year === catalogue.academicYear,
                ),
              ) ?? shortHeading(rule, compulsory))
            : compulsory && !covered && listed.outstanding.length > 0
              ? listed.outstanding.length === 1
                ? `Take ${listed.outstanding[0]}`
                : `Take ${listed.outstanding.length} more core courses`
              : !covered && estimatedCount && remainingUnits
                ? `Pick ${remainingUnits} units`
                : (requirementTitle(
                    rule,
                    catalogue.courses.filter(
                      (course) => course.year === catalogue.academicYear,
                    ),
                  ) ?? shortHeading(rule, compulsory)),
        detail: conditionSummary(
          rule,
          catalogue.courses.filter(
            (course) => course.year === catalogue.academicYear,
          ),
        ),
        count: figure
          ? `${Math.min(figure.value, figure.target)} / ${figure.target} ${figure.unit}`
          : "",
        progress:
          figure && figure.target > 0
            ? Math.min(1, figure.value / figure.target)
            : 0,
        bar,
        left,
        choice,
        covered,
        compulsory,
        courses,
        remainingCourses,
        estimatedCount,
        catchAll:
          rule.conditionKind === "units_total" ||
          rule.conditionKind === "elective_units",
        browse:
          listed.codes.length > 0
            ? null
            : (courseSearchHref(rule, catalogue.academicYear)?.split("?")[1] ??
              null),
        matching:
          listed.codes.length === 0 &&
          catalogue.academicYear !== null &&
          boundedRequirement(rule)
            ? {
                query: requirementCourseParams(
                  rule,
                  catalogue.academicYear,
                ).toString(),
                statusByCode: context.attemptStatusByCode,
              }
            : null,
        note:
          rule.conditionKind === "units_total"
            ? "Every course counts here, core and elective alike, so the rules above fill it as you plan."
            : null,
      };
    };
    const rules = ordered.map(toRule);
    return {
      structure,
      rules,
      openCount: openCourseCount(rules),
      estimatedCount: rules.some(
        (rule) => !rule.covered && rule.estimatedCount,
      ),
    };
  });
}

/** What the planner knows about a course before it is added. */
export type CourseHints = {
  academicYear: number | null;
  /**
   * The course levels a rule any course fills draws on, such as "1-4" for an
   * undergraduate degree. Undefined lists every level.
   */
  electiveLevel?: string;
  /** Where the course's prerequisites stand against the plan. */
  prerequisites: (course: Course) => PlanPrerequisites;
  /** Courses best first for this student, leaving out ones that clash with the plan. */
  rank: (courses: readonly Course[]) => Course[];
};

/** Covered prerequisites rank first; a rule to read or a permission to ask comes next. */
const PREREQUISITE_SCORE: Record<PlanPrerequisites, number> = {
  met: 100,
  permission: 60,
  unknown: 60,
  missing: 0,
};

const COURSE_CODE = /\b[A-Z]{4}\d{4}\b/gu;

/**
 * Orders courses for a student: prerequisites the plan already covers first,
 * then subjects they already study, then levels near the highest they have
 * reached. A course listed as incompatible with one in the plan is left out.
 */
export function rankCourses(
  courses: readonly Course[],
  {
    planCodes,
    prerequisites,
  }: {
    planCodes: ReadonlySet<string>;
    prerequisites: (course: Course) => PlanPrerequisites;
  },
): Course[] {
  const subjectCounts = new Map<string, number>();
  let topLevel = 1000;
  for (const code of planCodes) {
    const subject = code.slice(0, 4);
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
    const level = Number(code.slice(4, 5)) * 1000;
    if (level > topLevel) topLevel = level;
  }
  const score = (course: Course) =>
    PREREQUISITE_SCORE[prerequisites(course)] +
    Math.min(40, (subjectCounts.get(course.code.slice(0, 4)) ?? 0) * 5) -
    Math.abs(course.level - topLevel) / 250;
  return courses
    .filter(
      (course) =>
        !planCodes.has(course.code) &&
        !(course.incompatibilities.join(" ").match(COURSE_CODE) ?? []).some(
          (code) => planCodes.has(code),
        ),
    )
    .map((course) => ({ course, score: score(course) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.course.code.localeCompare(right.course.code),
    )
    .map(({ course }) => course);
}
