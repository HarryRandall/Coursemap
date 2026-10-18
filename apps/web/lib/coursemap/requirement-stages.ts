import {
  conditionTone,
  hidesCondition,
  type RequirementReading,
} from "@/lib/coursemap/requirement-classification";
import {
  requirementCourseCodes,
  requirementCourseCount,
} from "@/lib/coursemap/requirement-titles";
import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
} from "@/lib/coursemap/requirement-tree-node";
import type { Course } from "@/lib/coursemap/types";

/**
 * The parts of a degree a reader recognises, in the order they are shown.
 * ANU publishes rules in whatever order the handbook lists them, with a cap
 * on first-year units ahead of the compulsory courses, so a reading surface
 * regroups them rather than drawing the tree as imported.
 */
export type RequirementStageKind =
  | "compulsory"
  | "choices"
  | "set"
  | "pathways"
  | "structures"
  | "breadth"
  | "electives"
  | "degree"
  | "limits"
  | "notes";

export type RequirementStage = {
  kind: RequirementStageKind;
  title: string;
  rules: RequirementTreeNode[];
  /** The least the stage adds to the degree, or null when its rules do not say. */
  units: number | null;
};

const STAGE_ORDER: readonly RequirementStageKind[] = [
  "compulsory",
  "choices",
  "set",
  "pathways",
  "structures",
  "breadth",
  "electives",
  "degree",
  "limits",
  "notes",
];

const STAGE_TITLES: Record<
  Exclude<RequirementStageKind, "set" | "pathways" | "structures">,
  string
> = {
  compulsory: "Compulsory courses",
  choices: "Course choices",
  breadth: "Level and subject rules",
  electives: "Electives",
  degree: "Across the whole degree",
  limits: "Limits",
  notes: "Notes",
};

/**
 * Stages that fill a share of the degree rather than constrain or annotate it.
 * Level and subject rules are met by courses another stage already counts, so
 * drawing them as a share of their own would count those units twice.
 */
export const FILLING_STAGE_KINDS: ReadonlySet<RequirementStageKind> = new Set([
  "compulsory",
  "choices",
  "set",
  "pathways",
  "structures",
  "electives",
]);

export type RequirementStageOptions = RequirementReading & {
  /** Published courses for the structure's year, for unit values. */
  courses?: readonly Course[];
};

const STRUCTURE_KIND_TITLES: Record<string, string> = {
  major: "Majors",
  minor: "Minors",
  specialisation: "Specialisations",
  programme: "Programmes",
};

function fixedUnits(code: string, courses: readonly Course[]) {
  const course = courses.find((candidate) => candidate.code === code);
  return course?.unitValue?.kind === "fixed" ? course.unitValue.units : null;
}

function requiresEveryCourse(
  condition: RequirementTreeCondition,
  courses: readonly Course[],
) {
  const codes = requirementCourseCodes(condition);
  return (
    codes.length > 0 &&
    !condition.includesAnyCourse &&
    (condition.conditionKind === "course" ||
      condition.conditionKind === "consecutive_semester_pair" ||
      (condition.minimumCourses !== null &&
        condition.minimumCourses >= codes.length) ||
      requirementCourseCount(condition, courses) === codes.length)
  );
}

/**
 * The least a rule adds to the degree. Notes, caps and degree-wide rules add
 * nothing: a degree-wide rule constrains courses other rules count. A course
 * list without a unit figure is sized from its courses when the catalogue
 * knows them all; otherwise it cannot be told and the result is null.
 */
export function ruleMinimumUnits(
  node: RequirementTreeNode,
  courses: readonly Course[] = [],
): number | null {
  if (node.scope === "degree") return 0;
  if (node.type === "group") {
    if (node.minimumUnits !== null && node.minimumUnits > 0) {
      return node.minimumUnits;
    }
    const parts = node.children.map((child) =>
      ruleMinimumUnits(child, courses),
    );
    if (parts.some((part) => part === null)) return null;
    const known = parts as number[];
    if (node.operator === "any_of")
      return known.length ? Math.min(...known) : 0;
    if (node.operator === "at_least") {
      const count = Math.min(known.length, Math.max(1, node.minimumCount ?? 1));
      return known
        .toSorted((left, right) => left - right)
        .slice(0, count)
        .reduce((sum, part) => sum + part, 0);
    }
    return known.reduce((sum, part) => sum + part, 0);
  }
  if (conditionTone(node) !== "requirement") return 0;
  if (node.minimumUnits !== null && node.minimumUnits > 0) {
    return node.minimumUnits;
  }
  const codes = requirementCourseCodes(node);
  if (codes.length === 0 || node.includesAnyCourse) return null;
  const units = codes.map((code) => fixedUnits(code, courses));
  if (units.some((value) => value === null || value <= 0)) return null;
  const known = units as number[];
  const count = requirementCourseCount(node, courses);
  if (count === codes.length) return known.reduce((sum, part) => sum + part, 0);
  const shared = known[0];
  if (count !== null && known.every((value) => value === shared)) {
    return count * shared;
  }
  return null;
}

function conditionStageKind(
  condition: RequirementTreeCondition,
  courses: readonly Course[],
): RequirementStageKind {
  const tone = conditionTone(condition);
  if (tone === "warning" || tone === "note") return "notes";
  if (tone === "limit") return "limits";
  // "Not enrolled in" excludes a structure rather than offering one to take.
  if (
    condition.conditionKind === "structure" &&
    condition.matchesStructure === false
  ) {
    return "notes";
  }
  if (
    condition.conditionKind === "structure_set" ||
    condition.conditionKind === "structure"
  ) {
    return "structures";
  }
  if (
    condition.includesAnyCourse ||
    condition.conditionKind === "elective_units"
  ) {
    return "electives";
  }
  if (condition.scope === "degree") return "degree";
  if (requirementCourseCodes(condition).length === 0) return "breadth";
  return requiresEveryCourse(condition, courses) ? "compulsory" : "choices";
}

/**
 * A set of rules with no heading or bounds of its own, or whose bounds only
 * repeat the structure's total, wraps its children without saying anything
 * about them, so they stand at the top level in its place.
 */
function wrapsChildren(
  group: RequirementTreeGroup,
  reading: RequirementReading,
) {
  if (group.operator !== "all_of" || group.description || group.title) {
    return false;
  }
  const inheritedTarget =
    reading.unitTarget != null &&
    group.minimumUnits === reading.unitTarget &&
    (group.maximumUnits === null || group.maximumUnits === reading.unitTarget);
  return (
    inheritedTarget ||
    (group.minimumUnits === null && group.maximumUnits === null)
  );
}

function topLevelRules(
  group: RequirementTreeGroup,
  reading: RequirementReading,
): RequirementTreeNode[] {
  return group.children.flatMap((child) => {
    if (child.type === "condition") {
      return hidesCondition(child, reading) ? [] : [child];
    }
    return wrapsChildren(child, reading)
      ? topLevelRules(child, reading)
      : [child];
  });
}

function structuresTitle(rules: RequirementTreeNode[]) {
  const kinds = [
    ...new Set(
      rules.flatMap((rule) =>
        rule.type === "condition"
          ? rule.options
              .filter((option) => option.kind !== "course")
              .map((option) => option.structureKind ?? rule.structureKind)
          : [],
      ),
    ),
  ].filter((kind): kind is string => Boolean(kind));
  const titles = kinds.map((kind) => STRUCTURE_KIND_TITLES[kind] ?? kind);
  return titles.length ? titles.join(" and ") : "Academic structures";
}

/**
 * The heading for a choice ANU left unnamed. Alternatives that are each one
 * course list are options; only a choice between sets of rules is a pathway.
 */
export function pathwaysTitle(group: RequirementTreeGroup) {
  const noun = group.children.some((child) => child.type === "group")
    ? "pathway"
    : "option";
  if (group.operator === "at_least" && (group.minimumCount ?? 1) > 1) {
    return `Choose ${group.minimumCount} ${noun}s`;
  }
  return `Choose one ${noun}`;
}

/** What a choice asks, short enough to sit above its options. */
export function pathwayInstruction(group: RequirementTreeGroup) {
  if (group.operator === "at_least") {
    const count = group.minimumCount ?? 1;
    return count > 1 ? `Choose at least ${count}` : "Choose at least one";
  }
  return "Choose one";
}

function stageUnits(rules: RequirementTreeNode[], courses: readonly Course[]) {
  const parts = rules.map((rule) => ruleMinimumUnits(rule, courses));
  if (parts.some((part) => part === null)) return null;
  return (parts as number[]).reduce((sum, part) => sum + part, 0);
}

/** The structure's rules regrouped into stages, in reading order. */
export function requirementStages(
  root: RequirementTreeGroup,
  options: RequirementStageOptions = {},
): RequirementStage[] {
  const courses = options.courses ?? [];
  const merged = new Map<RequirementStageKind, RequirementTreeNode[]>();
  const standalone: Array<{
    order: number;
    position: number;
    stage: RequirementStage;
  }> = [];
  topLevelRules(root, options).forEach((rule, position) => {
    if (rule.type === "condition") {
      const kind = conditionStageKind(rule, courses);
      merged.set(kind, [...(merged.get(kind) ?? []), rule]);
      return;
    }
    const pathway = rule.operator === "any_of" || rule.operator === "at_least";
    // A degree-wide group, such as ANU's "Degree-wide rules", constrains the
    // whole degree: summing its minimums and caps would claim units it never adds.
    const kind: RequirementStageKind =
      rule.scope === "degree" ? "degree" : pathway ? "pathways" : "set";
    standalone.push({
      order: STAGE_ORDER.indexOf(kind),
      position,
      stage: {
        kind,
        title:
          rule.title ??
          rule.description ??
          (kind === "degree"
            ? STAGE_TITLES.degree
            : pathway
              ? pathwaysTitle(rule)
              : "Course requirements"),
        rules: [rule],
        units: FILLING_STAGE_KINDS.has(kind)
          ? ruleMinimumUnits(rule, courses)
          : null,
      },
    });
  });
  const mergedStages = [...merged.entries()].map(([kind, rules]) => ({
    order: STAGE_ORDER.indexOf(kind),
    position: -1,
    stage: {
      kind,
      title:
        kind === "structures"
          ? structuresTitle(rules)
          : STAGE_TITLES[kind as keyof typeof STAGE_TITLES],
      rules,
      units: FILLING_STAGE_KINDS.has(kind) ? stageUnits(rules, courses) : null,
    },
  }));
  return [...mergedStages, ...standalone]
    .toSorted(
      (left, right) =>
        left.order - right.order || left.position - right.position,
    )
    .map((entry) => entry.stage);
}

export type StructureComposition = {
  segments: Array<{ kind: RequirementStageKind; title: string; units: number }>;
  /** Units the drawn stages account for between them. */
  allocated: number;
  /** Units of the target no stage claims, or null without a target. */
  unallocated: number | null;
  /** False when a filling stage could not be sized, so the remainder is not all free. */
  complete: boolean;
};

/**
 * How the structure's units divide between its stages. Returns null when no
 * stage is sized, or when the sized stages claim more than the target
 * between them: rules that overlap cannot be drawn as shares of one bar.
 */
export function structureComposition(
  stages: readonly RequirementStage[],
  unitTarget: number | null,
): StructureComposition | null {
  const filling = stages.filter((stage) => FILLING_STAGE_KINDS.has(stage.kind));
  const segments = filling
    .filter(
      (stage): stage is RequirementStage & { units: number } =>
        stage.units !== null && stage.units > 0,
    )
    .map((stage) => ({
      kind: stage.kind,
      title: stage.title,
      units: stage.units,
    }));
  if (segments.length === 0) return null;
  const allocated = segments.reduce((sum, segment) => sum + segment.units, 0);
  if (unitTarget !== null && allocated > unitTarget) return null;
  return {
    segments,
    allocated,
    unallocated: unitTarget === null ? null : unitTarget - allocated,
    complete: filling.every((stage) => stage.units !== null),
  };
}
