import {
  isTdTag,
  tdDesignationForAttempt,
  type TdDesignation,
} from "./td-designation";
import type {
  PlanRequirementCondition,
  PlanRequirementGroup,
  PlanRequirementNode,
  PlanStructureRequirements,
} from "@/lib/coursemap/plan-catalogue";
import type { Attempt, RequirementOverride } from "@/lib/coursemap/types";
import {
  isActiveAttempt,
  planningCourseForAttempt,
  unitsForAttempt,
  type PlanningCatalogue,
} from "@/lib/planner";

export type DesignationReview = {
  unknownUnits: number;
  detail: string;
  affectsResult?: boolean;
};

export type RequirementBucketProgress = {
  designationReview?: DesignationReview;
  key: string;
  satisfiedByOverride?: boolean;
  title: string;
  /** Full rule prose, untruncated, for tooltips and wider layouts. */
  description: string;
  /** "Major", "Minor", "Specialisation", or "Requirement" for the programme. */
  kind: string;
  /** Unit goal for the bucket, when the published rule states one. */
  targetUnits: number | null;
  completedUnits: number;
  /** Units scheduled (planned or enrolled) but not yet completed. */
  plannedUnits: number;
};

type MatchableCourse = {
  code: string;
  subject: string;
  level: number;
  tags?: readonly string[];
  tdDesignation?: TdDesignation;
};
type CoursePredicate = (course: MatchableCourse) => boolean;

const COURSE_CODE = /^[A-Z]{4}\d{4}[A-Z]?$/;

function levelWithin(
  courseLevel: number,
  minimum: number | null,
  maximum: number | null,
) {
  // Levels are published on the 1000 scale but some rules record 1–9.
  const normalise = (value: number) => (value < 10 ? value * 1000 : value);
  if (minimum !== null && normalise(courseLevel) < normalise(minimum)) {
    return false;
  }
  if (maximum !== null && normalise(courseLevel) > normalise(maximum)) {
    return false;
  }
  return true;
}

function conditionPredicates(
  condition: Pick<
    PlanRequirementCondition,
    | "options"
    | "conditionKind"
    | "subjectCode"
    | "minimumLevel"
    | "maximumLevel"
  > &
    Partial<Pick<PlanRequirementCondition, "tag">>,
): CoursePredicate[] {
  const predicates: CoursePredicate[] = [];
  const codes = new Set(
    condition.options
      .map((option) => option.code)
      .filter((code) => COURSE_CODE.test(code)),
  );
  if (codes.size > 0) {
    predicates.push((course) => codes.has(course.code));
  }
  if (condition.conditionKind === "subject_units" && condition.subjectCode) {
    const subject = condition.subjectCode;
    predicates.push(
      (course) =>
        subject.split(/[,\s]+/u).includes(course.subject) &&
        levelWithin(
          course.level,
          condition.minimumLevel,
          condition.maximumLevel,
        ),
    );
  } else if (condition.conditionKind === "level_units") {
    predicates.push(
      (course) =>
        (!condition.subjectCode ||
          condition.subjectCode.split(/[,\s]+/u).includes(course.subject)) &&
        levelWithin(
          course.level,
          condition.minimumLevel,
          condition.maximumLevel,
        ),
    );
  } else if (condition.conditionKind === "tagged_units" && condition.tag) {
    // A tag is one category however it is capitalised.
    if (isTdTag(condition.tag)) {
      predicates.push(
        (course) =>
          (course.tdDesignation === undefined
            ? (course.tags ?? []).some(
                (tag) => tag.toLowerCase() === condition.tag!.toLowerCase(),
              )
            : course.tdDesignation === "member") &&
          levelWithin(
            course.level,
            condition.minimumLevel,
            condition.maximumLevel,
          ),
      );
      return predicates;
    }
    const tag = condition.tag.toLowerCase();
    predicates.push(
      (course) =>
        (course.tags ?? []).some(
          (candidate) => candidate.toLowerCase() === tag,
        ) &&
        levelWithin(
          course.level,
          condition.minimumLevel,
          condition.maximumLevel,
        ),
    );
  }
  return predicates;
}

/** Electives and open lists take any course, so they are always checkable. */
function takesAnyCourse(
  condition: Pick<PlanRequirementCondition, "conditionKind"> &
    Partial<Pick<PlanRequirementCondition, "includesAnyCourse">>,
) {
  return (
    condition.conditionKind === "elective_units" ||
    Boolean(condition.includesAnyCourse)
  );
}

export function canMeasureRequirementCondition(
  condition: Pick<
    PlanRequirementCondition,
    | "options"
    | "conditionKind"
    | "subjectCode"
    | "minimumLevel"
    | "maximumLevel"
    | "minimumUnits"
    | "maximumUnits"
    | "minimumCourses"
  > &
    Partial<Pick<PlanRequirementCondition, "tag" | "includesAnyCourse">>,
) {
  if (condition.conditionKind === "consecutive_semester_pair") {
    return (
      condition.minimumUnits !== null &&
      condition.options.length === 2 &&
      condition.options.every((option) => option.kind === "course") &&
      condition.options[0]?.code !== condition.options[1]?.code
    );
  }
  return (
    (conditionPredicates(condition).length > 0 || takesAnyCourse(condition)) &&
    (condition.minimumUnits !== null ||
      condition.maximumUnits !== null ||
      condition.minimumCourses !== null)
  );
}

/**
 * Listed courses a condition lets count more than once, with the total units
 * their attempts may contribute there.
 */
function repeatAllowances(
  condition: Pick<PlanRequirementCondition, "options">,
): Map<string, number> {
  return new Map(
    condition.options.flatMap((option) =>
      option.kind === "course" &&
      option.maximumUnits != null &&
      option.maximumUnits > 0
        ? [[option.code, option.maximumUnits] as const]
        : [],
    ),
  );
}

/** The largest repeat allowance for each course anywhere inside the node. */
function nodeRepeatAllowances(node: PlanRequirementNode): Map<string, number> {
  const allowances = new Map<string, number>();
  const visit = (current: PlanRequirementNode) => {
    if (current.type === "group") {
      current.children.forEach(visit);
      return;
    }
    for (const [code, units] of repeatAllowances(current))
      allowances.set(code, Math.max(units, allowances.get(code) ?? 0));
  };
  visit(node);
  return allowances;
}

function repeatableCourseCodes(node: PlanRequirementNode | null) {
  return new Set(node ? nodeRepeatAllowances(node).keys() : []);
}

function containsTdRequirement(node: PlanRequirementNode): boolean {
  return node.type === "group"
    ? node.children.some(containsTdRequirement)
    : node.conditionKind === "tagged_units" &&
        Boolean(node.tag && isTdTag(node.tag));
}

function collectPredicates(node: PlanRequirementNode): CoursePredicate[] {
  if (node.type === "condition") return conditionPredicates(node);
  return node.children.flatMap(collectPredicates);
}

function countableBucketPredicates(
  node: PlanRequirementNode,
  credited: readonly CreditedAttempt[],
): CoursePredicate[] {
  if (node.type === "group")
    return node.children.flatMap((child) =>
      countableBucketPredicates(child, credited),
    );
  if (node.conditionKind === "consecutive_semester_pair") {
    const sequence = pairSequence(node, credited);
    if (sequence === "invalid" || sequence === "unknown") return [];
  }
  return conditionPredicates(node);
}

/**
 * Whether a course is named by, or falls under a subject or level rule
 * anywhere inside, the node. Returns null when nothing inside is measurable.
 */
export function requirementNodeMatcher(
  node: PlanRequirementNode,
): CoursePredicate | null {
  const predicates = collectPredicates(node);
  if (predicates.length === 0) return null;
  return (course) => predicates.some((matches) => matches(course));
}

/** The unit goal a top-level requirement states, from its bounds or prose. */
export function requirementTargetUnits(node: PlanRequirementNode) {
  return bucketTargetUnits(node);
}

/**
 * Published rule prose leads with its unit count — "30 units from the
 * completion of the following compulsory courses". The lead is dropped from the
 * label because it truncates to nothing useful in a narrow card, and the count
 * is recovered separately as the unit target.
 */
const RULE_LEAD =
  /^\d+\s*units?\s+from\s+(?:the\s+)?(?:completion\s+of\s+)?(?:the\s+)?(?:following\s+)?/i;

function bucketDescription(node: PlanRequirementNode): string | null {
  const text =
    node.type === "group"
      ? (node.title ?? node.description ?? null)
      : (node.freeText ??
        (node.subjectCode ? `${node.subjectCode} courses` : null) ??
        node.sourceText ??
        null);
  return text ? text.replace(/\s+/g, " ").trim() : null;
}

function bucketTitle(node: PlanRequirementNode): string | null {
  const text = bucketDescription(node);
  if (!text) return null;
  const stripped = text.replace(RULE_LEAD, "").trim();
  const label = stripped.length > 2 ? stripped : text;
  const cased = label.charAt(0).toUpperCase() + label.slice(1);
  return cased.length > 64 ? `${cased.slice(0, 61)}…` : cased;
}

/** The unit count stated at the head of the rule prose, when there is one. */
function unitsFromRuleText(text: string | null): number | null {
  if (!text) return null;
  const match = /^(\d+)\s*units?\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

/** The published structure a group belongs to, titled for display. */
function bucketKind(node: PlanRequirementNode): string {
  const kind = node.type === "condition" ? node.structureKind : null;
  if (!kind || kind === "programme") return "Requirement";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function bucketTargetUnits(node: PlanRequirementNode): number | null {
  return (
    node.minimumUnits ??
    node.maximumUnits ??
    unitsFromRuleText(bucketDescription(node))
  );
}

const NO_REPEATS: ReadonlySet<string> = new Set();

/**
 * Keep earned credit even when a later planned entry repeats the course. A
 * course in `repeatable` also keeps one further attempt for each other
 * teaching period, which counts only where a rule allows the repeat.
 */
function activeAttempts(
  attempts: readonly Attempt[],
  repeatable: ReadonlySet<string> = NO_REPEATS,
) {
  const active = attempts.filter(isActiveAttempt);
  const byCourse = new Map<string, Attempt>();
  active.forEach((attempt) => {
    if (byCourse.get(attempt.courseCode)?.status !== "completed") {
      byCourse.set(attempt.courseCode, attempt);
    }
  });
  const repeats: Attempt[] = [];
  const periodsByCourse = new Map<string, Set<string>>();
  for (const attempt of active) {
    const first = byCourse.get(attempt.courseCode)!;
    if (!repeatable.has(attempt.courseCode) || attempt === first) continue;
    const periods =
      periodsByCourse.get(attempt.courseCode) ?? new Set([first.termId]);
    // Two entries in one period are the same attempt recorded twice.
    if (periods.has(attempt.termId)) continue;
    periods.add(attempt.termId);
    periodsByCourse.set(attempt.courseCode, periods);
    repeats.push(attempt);
  }
  return { first: [...byCourse.values()], repeats };
}

/**
 * Approximate per-bucket progress for the dashboard requirements panel.
 *
 * Buckets are the top-level nodes of the programme's published requirement
 * tree. A plan attempt credits a bucket when it matches any listed course,
 * subject rule or level rule nested inside — a readable signal, not a formal
 * audit, which stays the job of the requirements page.
 */
export function requirementBucketProgress({
  requirements,
  attempts,
  catalogue,
  overrides = [],
}: {
  overrides?: readonly RequirementOverride[];
  requirements: readonly PlanStructureRequirements[];
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
}): RequirementBucketProgress[] {
  const programme =
    requirements.find(
      (structure) => structure.structureKind === "programme" && structure.root,
    ) ?? requirements.find((structure) => structure.root);
  const root: PlanRequirementGroup | null = programme?.root ?? null;
  if (!root) return [];

  const buckets = root.children
    .map((node) => ({
      node,
      title: bucketTitle(node),
      description: bucketDescription(node) ?? "",
      predicates: collectPredicates(node),
    }))
    .filter(
      (bucket): bucket is typeof bucket & { title: string } =>
        bucket.title !== null && bucket.predicates.length > 0,
    );

  const credited = creditedAttempts(
    attempts,
    catalogue,
    repeatableCourseCodes(root),
  );

  const hasTdUncertainty =
    containsTdRequirement(root) &&
    credited.some((entry) => entry.course.tdDesignation === "unknown");
  const overriddenProgress =
    hasTdUncertainty ||
    overrides.some((item) => item.structureCode === programme?.structureCode)
      ? requirementTreeProgress({
          root,
          attempts,
          catalogue,
          overrides,
          structureCode: programme?.structureCode,
        })
      : null;
  return buckets.map(({ node, title, description }) => {
    const predicates = countableBucketPredicates(node, credited);
    const allowances = nodeRepeatAllowances(node);
    const unitsByCourse = new Map<string, number>();
    let completedUnits = 0;
    let plannedUnits = 0;
    credited.forEach(({ attempt, course, units, repeat }) => {
      if (!predicates.some((matches) => matches(course))) return;
      const counted = unitsByCourse.get(course.code) ?? 0;
      if (repeat && counted + units > (allowances.get(course.code) ?? 0))
        return;
      unitsByCourse.set(course.code, counted + units);
      if (attempt.status === "completed") completedUnits += units;
      else plannedUnits += units;
    });
    const overrideProgress =
      containsTdRequirement(node) ||
      overrides.some((item) => item.structureCode === programme?.structureCode)
        ? overriddenProgress?.get(requirementNodeKey(node))
        : undefined;
    if (overrideProgress) {
      completedUnits = overrideProgress.completedUnits;
      plannedUnits = overrideProgress.plannedUnits;
    }
    const reviewForNode = (
      candidate: PlanRequirementNode,
    ): DesignationReview | undefined => {
      const result = overriddenProgress?.get(requirementNodeKey(candidate));
      if (result?.designationReview) return result.designationReview;
      return candidate.type === "group"
        ? candidate.children.map(reviewForNode).find(Boolean)
        : undefined;
    };
    const designationReview =
      overrideProgress &&
      !["satisfied", "done-by-override"].includes(overrideProgress.state)
        ? reviewForNode(node)
        : undefined;
    return {
      key: `${node.type}-${node.id}`,
      ...(designationReview ? { designationReview } : {}),
      ...(overrideProgress
        ? {
            satisfiedByOverride:
              overrideProgress.state === "done-by-override" ||
              (overrideProgress.state === "satisfied" &&
                (overrideProgress.creditedUnits ?? 0) > 0),
          }
        : {}),
      title,
      description,
      kind: bucketKind(node),
      targetUnits: bucketTargetUnits(node),
      completedUnits,
      plannedUnits,
    };
  });
}

/**
 * How far a single rule has progressed against the plan.
 *
 * - `satisfied`: the completed work already meets the rule's minimum.
 * - `in_progress`: some completed or planned work counts, but not enough yet.
 * - `not_started`: nothing in the plan matches the rule.
 * - `over_limit`: a maximum-only rule has more units mapped than it allows.
 * - `unmeasured`: the rule has no course, subject or level test Coursemap can
 *   evaluate (tags, free text, unrestricted electives), or no stated target.
 */
export type RequirementNodeState =
  | "done-by-override"
  | "satisfied"
  | "in_progress"
  | "not_started"
  | "over_limit"
  | "unmeasured";

export type RequirementNodeProgress = {
  designationReview?: DesignationReview;
  key: string;
  state: RequirementNodeState;
  override?: RequirementOverride;
  creditedUnits?: number;
  /** Minimum units the rule asks for, when it states one. */
  targetUnits: number | null;
  /** Maximum units the rule allows, when it states one. */
  maximumUnits: number | null;
  /** Minimum number of listed courses the rule asks for, when it states one. */
  targetCourses: number | null;
  completedUnits: number;
  /** Units scheduled (planned or enrolled) but not yet completed. */
  plannedUnits: number;
  /** Course codes from the plan that counted toward this rule. */
  matchedCourseCodes: string[];
};

export type RequirementTreeProgress = ReadonlyMap<
  string,
  RequirementNodeProgress
>;

export function requirementNodeKey(node: PlanRequirementNode) {
  return `${node.type}-${node.id}`;
}

export type CreditedAttempt = {
  attempt: Attempt;
  course: MatchableCourse & { name: string; units?: number };
  units: number;
  /**
   * A further attempt of a course already credited. It counts only where a
   * rule lets the course repeat; see `CoursePlacement.repeats`.
   */
  repeat?: true;
};

/**
 * Active plan entries, one per course, with the catalogue row they credit.
 * Courses in `repeatable` also yield their further attempts, marked `repeat`
 * and listed after every first attempt.
 */
export function creditedAttempts(
  attempts: readonly Attempt[],
  catalogue: PlanningCatalogue,
  repeatable: ReadonlySet<string> = NO_REPEATS,
  tdPossibility = false,
): CreditedAttempt[] {
  const { first, repeats } = activeAttempts(attempts, repeatable);
  const credit = (attempt: Attempt, repeat: boolean): CreditedAttempt[] => {
    const course = planningCourseForAttempt(attempt, catalogue);
    if (!course) return [];
    const designation = tdDesignationForAttempt(
      attempt,
      course,
      catalogue.historicalTd,
    );
    const effectiveCourse =
      designation === undefined
        ? course
        : {
            ...course,
            tdDesignation:
              tdPossibility && designation === "unknown"
                ? ("member" as const)
                : designation,
          };
    return [
      {
        attempt,
        course: effectiveCourse,
        units: unitsForAttempt(attempt, course),
        ...(repeat ? { repeat: true as const } : {}),
      },
    ];
  };
  return [
    ...first.flatMap((attempt) => credit(attempt, false)),
    ...repeats.flatMap((attempt) => credit(attempt, true)),
  ];
}

/**
 * Whether a credited attempt counts towards anything in the degree: a first
 * attempt unless a cap excludes it, and a further attempt only when it was
 * allocated under a repeat allowance.
 */
function countsInDegree(
  entry: CreditedAttempt,
  allocation: RequirementAllocation,
) {
  const placement = allocation.get(entry.course.code);
  if (placement?.overCapKey) return false;
  return (
    !entry.repeat || Boolean(placement?.repeats?.includes(entry.attempt.id))
  );
}

function stateFromUnits({
  targetUnits,
  maximumUnits,
  targetCourses,
  completedUnits,
  plannedUnits,
  completedCourses,
  measurable,
}: {
  targetUnits: number | null;
  maximumUnits: number | null;
  targetCourses: number | null;
  completedUnits: number;
  plannedUnits: number;
  completedCourses: number;
  measurable: boolean;
}): RequirementNodeState {
  if (!measurable) return "unmeasured";
  const mapped = completedUnits + plannedUnits;
  if (maximumUnits !== null && mapped > maximumUnits) return "over_limit";
  if (targetUnits === null && targetCourses === null) {
    // A maximum-only rule is a cap rather than a goal: it is fine until the
    // plan crosses it. Without any stated bound there is nothing to measure.
    if (maximumUnits === null) return "unmeasured";
    return mapped > maximumUnits ? "over_limit" : "satisfied";
  }
  const unitsMet = targetUnits === null || completedUnits >= targetUnits;
  const coursesMet =
    targetCourses === null || completedCourses >= targetCourses;
  if (unitsMet && coursesMet) return "satisfied";
  if (mapped > 0) return "in_progress";
  return "not_started";
}

/** Where one counted course landed in a requirement tree. */
export type CoursePlacement = {
  /** The part of the degree the course counts towards, or null for none. */
  nodeKey: string | null;
  /** Whether a student chose this part rather than Coursemap. */
  pinned: boolean;
  /** A degree-wide cap the course fell beyond, so it counts towards nothing. */
  overCapKey: string | null;
  /**
   * Identifiers of further attempts of the course that also count at
   * `nodeKey`, within that rule's repeat allowance for it.
   */
  repeats?: readonly string[];
};

export type RequirementAllocation = ReadonlyMap<string, CoursePlacement>;

type UnitPool = { key: string; minimum: number | null; maximum: number | null };

type Leaf = {
  pools: UnitPool[];
  node: PlanRequirementCondition;
  key: string;
  scope: "part" | "degree";
  predicates: CoursePredicate[];
  /** Every group above is all_of, so the rule always applies. */
  mandatory: boolean;
};

function collectLeaves(
  node: PlanRequirementNode,
  inherited: "part" | "degree",
  mandatory: boolean,
  into: Leaf[],
  pools: UnitPool[] = [],
) {
  const scope =
    inherited === "degree" || node.scope === "degree" ? "degree" : "part";
  if (node.type === "group") {
    const childPools =
      scope === "part" &&
      (node.minimumUnits !== null || node.maximumUnits !== null)
        ? [
            ...pools,
            {
              key: requirementNodeKey(node),
              minimum: node.minimumUnits,
              maximum: node.maximumUnits,
            },
          ]
        : pools;
    node.children.forEach((child) =>
      collectLeaves(
        child,
        scope,
        mandatory && node.operator === "all_of",
        into,
        childPools,
      ),
    );
    return;
  }
  into.push({
    node,
    key: requirementNodeKey(node),
    scope: effectiveScope(node, scope, mandatory, pools.length > 0),
    pools,
    predicates: conditionPredicates(node),
    mandatory,
  });
}

/**
 * A rule with a maximum and nothing to reach, such as "a maximum of 60 units
 * from 1000-level courses", caps what counts rather than asking for anything,
 * so it spans the degree even on a page that writes no "of which" layer.
 */
function isCap(condition: PlanRequirementCondition) {
  return (
    condition.maximumUnits !== null &&
    condition.minimumUnits === null &&
    condition.minimumCourses === null
  );
}

/**
 * A cap is degree-wide only when it always applies; one alternative of an
 * either-or rule limits that alternative, not every course in the degree.
 */
function effectiveScope(
  condition: PlanRequirementCondition,
  inherited: "part" | "degree",
  mandatory: boolean,
  inUnitPool = false,
): "part" | "degree" {
  return inherited === "degree" ||
    condition.scope === "degree" ||
    (mandatory && !inUnitPool && !takesAnyCourse(condition) && isCap(condition))
    ? "degree"
    : "part";
}

/**
 * How specifically a part asks for a course, lower first, or null when the
 * course cannot count there. A course goes to the most specific part that has
 * room: named courses before short lists, lists before subject and level
 * rules, and open lists and electives last, since they take anything.
 */
function placementRank(leaf: Leaf, course: MatchableCourse): number | null {
  const condition = leaf.node;
  const listed = condition.options.filter(
    (option) => option.kind === "course" && option.code === course.code,
  );
  if (listed.length > 0) return condition.options.length;
  if (condition.conditionKind === "units_total") return null;
  if (leaf.predicates.some((matches) => matches(course))) {
    if (condition.conditionKind === "subject_units") {
      return condition.minimumLevel !== null || condition.maximumLevel !== null
        ? 900
        : 1_000;
    }
    if (condition.conditionKind === "tagged_units") return 1_500;
    return 2_000;
  }
  if (condition.includesAnyCourse) return 8_000;
  if (condition.conditionKind === "elective_units") return 9_000;
  return null;
}

function semesterNumber(termId: string): number | null {
  const match = /^(\d{4})-s([12])$/i.exec(termId);
  if (!match) return null;
  return Number(match[1]) * 2 + Number(match[2]) - 1;
}

function pairSequence(
  condition: PlanRequirementCondition,
  credited: readonly CreditedAttempt[],
): "partial" | "unknown" | "valid" | "invalid" {
  const codes = condition.options.map((option) => option.code);
  if (
    codes.length !== 2 ||
    codes[0] === codes[1] ||
    condition.options.some((option) => option.kind !== "course")
  )
    return "invalid";
  const first = credited.find(
    (entry) => !entry.repeat && entry.course.code === codes[0],
  );
  const second = credited.find(
    (entry) => !entry.repeat && entry.course.code === codes[1],
  );
  if (!first || !second) return "partial";
  const firstSemester = semesterNumber(first.attempt.termId);
  const secondSemester = semesterNumber(second.attempt.termId);
  if (firstSemester === null || secondSemester === null) return "unknown";
  return secondSemester === firstSemester + 1 ? "valid" : "invalid";
}

/** A bounded degree root counts the total; its parts still allocate separately. */
function allocationRoot(root: PlanRequirementGroup): PlanRequirementGroup {
  return root.scope === "degree" &&
    (root.minimumUnits !== null || root.maximumUnits !== null) &&
    root.children.some((child) => child.scope === "degree") &&
    root.children.some((child) => child.scope !== "degree")
    ? { ...root, scope: "part" }
    : root;
}

// Evaluate whole alternatives before assigning courses shared by their branches.
// A bounded search avoids exponential work on deeply nested catalogue rules.
const MAX_ALLOCATION_ALTERNATIVES = 128;

function allocationAlternatives(
  node: PlanRequirementNode,
): PlanRequirementNode[] {
  if (node.type === "condition") return [node];
  if (node.operator === "any_of") {
    return node.children
      .flatMap((child) =>
        allocationAlternatives(child).map((alternative) => ({
          ...node,
          children: [alternative],
        })),
      )
      .slice(0, MAX_ALLOCATION_ALTERNATIVES);
  }
  let variants: PlanRequirementNode[][] = [[]];
  for (const child of node.children) {
    const alternatives = allocationAlternatives(child);
    variants = variants
      .flatMap((children) =>
        alternatives.map((alternative) => [...children, alternative]),
      )
      .slice(0, MAX_ALLOCATION_ALTERNATIVES);
  }
  return variants.map((children) => ({ ...node, children }));
}

/**
 * Assigns each course in the plan to at most one part of the degree.
 *
 * Degree-wide caps apply first, completed work before planned: a course that
 * would take a cap past its limit counts towards nothing and is flagged. Each
 * remaining course then goes to the most specific part that still needs units
 * and has room under its own maximum, with a student's own choice taking
 * precedence wherever the course may count. Courses with a single possible
 * home claim their place before courses that could go anywhere.
 */
function allocateSingleAlternative({
  root,
  attempts,
  catalogue,
  pins = new Map(),
  overrides = [],
  tdPossibility = false,
}: {
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
  /** A student's chosen part for a course, by course code. */
  pins?: ReadonlyMap<string, string>;
  overrides?: readonly RequirementOverride[];
  tdPossibility?: boolean;
}): RequirementAllocation {
  const placements = new Map<string, CoursePlacement>();
  if (!root) return placements;
  const leaves: Leaf[] = [];
  collectLeaves(allocationRoot(root), "part", true, leaves);
  const overriddenKeys = new Set(overrides.map((item) => item.requirementKey));
  const activeLeaves = leaves.filter(
    (leaf) => !overriddenKeys.has(leaf.node.projectionKey),
  );
  const credited = orderedCredit(
    creditedAttempts(
      attempts,
      catalogue,
      repeatableCourseCodes(root),
      tdPossibility,
    ),
  );

  // Caps across the degree decide what may count at all. Further attempts of
  // a repeatable course follow their first attempt's placement below.
  const excluded = new Map<string, string>();
  for (const leaf of activeLeaves) {
    const cap = leaf.node.maximumUnits;
    if (leaf.scope !== "degree" || !leaf.mandatory || cap === null) continue;
    let used = 0;
    for (const { course, units, repeat } of credited) {
      if (repeat || excluded.has(course.code)) continue;
      if (!leaf.predicates.some((matches) => matches(course))) continue;
      if (used + units > cap) excluded.set(course.code, leaf.key);
      else used += units;
    }
  }

  const parts = activeLeaves.filter(
    (leaf) =>
      leaf.scope === "part" && leaf.node.conditionKind !== "units_total",
  );
  const used = new Map<string, number>();
  const candidatesFor = (course: MatchableCourse) =>
    parts
      .map((leaf) => ({ leaf, rank: placementRank(leaf, course) }))
      .filter(
        (candidate): candidate is { leaf: Leaf; rank: number } =>
          candidate.rank !== null &&
          (candidate.leaf.node.conditionKind !== "consecutive_semester_pair" ||
            pairSequence(candidate.leaf.node, credited) !== "invalid"),
      );
  const hasRoom = (leaf: Leaf, units: number) => {
    const maximum = leaf.node.maximumUnits;
    return (
      (maximum === null || (used.get(leaf.key) ?? 0) + units <= maximum) &&
      leaf.pools.every(
        (pool) =>
          pool.maximum === null ||
          (used.get(pool.key) ?? 0) + units <= pool.maximum,
      )
    );
  };
  const claim = (leaf: Leaf, units: number) => {
    used.set(leaf.key, (used.get(leaf.key) ?? 0) + units);
    for (const pool of leaf.pools)
      used.set(pool.key, (used.get(pool.key) ?? 0) + units);
  };
  const queue = credited
    .filter(({ course, repeat }) => !repeat && !excluded.has(course.code))
    .map((entry) => ({ entry, candidates: candidatesFor(entry.course) }))
    .toSorted(
      (left, right) =>
        Number(pins.has(right.entry.course.code)) -
          Number(pins.has(left.entry.course.code)) ||
        Math.min(...left.candidates.map(({ rank }) => rank), Infinity) -
          Math.min(...right.candidates.map(({ rank }) => rank), Infinity),
    );

  for (const { entry, candidates } of queue) {
    const { course, units } = entry;
    const room = candidates.filter(({ leaf }) => hasRoom(leaf, units));
    const pinnedKey = pins.get(course.code);
    const pinned = room.find(({ leaf }) => leaf.key === pinnedKey);
    const needing = (leaf: Leaf) => {
      const target = leaf.node.minimumUnits;
      return (
        (target !== null && (used.get(leaf.key) ?? 0) < target) ||
        leaf.pools.some(
          (pool) =>
            pool.minimum !== null && (used.get(pool.key) ?? 0) < pool.minimum,
        ) ||
        (target === null && !leaf.pools.length)
      );
    };
    const chosen =
      pinned ??
      room
        .filter(({ leaf }) => needing(leaf))
        .toSorted((left, right) => left.rank - right.rank)[0] ??
      room.toSorted((left, right) => left.rank - right.rank)[0];
    if (chosen) claim(chosen.leaf, units);
    placements.set(course.code, {
      nodeKey: chosen?.leaf.key ?? null,
      pinned: Boolean(pinned),
      overCapKey: null,
    });
  }

  // A further attempt counts only where the first attempt counts, while that
  // rule's allowance for the course and its own limits have room.
  const unitsByCourse = new Map(
    credited.flatMap(({ course, units, repeat }) =>
      repeat ? [] : [[course.code, units] as const],
    ),
  );
  for (const { attempt, course, units, repeat } of credited) {
    if (!repeat) continue;
    const placement = placements.get(course.code);
    const leaf = parts.find(({ key }) => key === placement?.nodeKey);
    const allowance = leaf && repeatAllowances(leaf.node).get(course.code);
    const counted = unitsByCourse.get(course.code) ?? 0;
    if (
      !placement ||
      !leaf ||
      allowance === undefined ||
      counted + units > allowance ||
      !hasRoom(leaf, units)
    )
      continue;
    claim(leaf, units);
    unitsByCourse.set(course.code, counted + units);
    placements.set(course.code, {
      ...placement,
      repeats: [...(placement.repeats ?? []), attempt.id],
    });
  }
  for (const [code, capKey] of excluded) {
    placements.set(code, { nodeKey: null, pinned: false, overCapKey: capKey });
  }
  return placements;
}

export function allocateRequirements({
  root,
  attempts,
  catalogue,
  pins = new Map(),
  overrides = [],
  tdPossibility = false,
}: {
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
  pins?: ReadonlyMap<string, string>;
  overrides?: readonly RequirementOverride[];
  tdPossibility?: boolean;
}): RequirementAllocation {
  if (!root) return new Map();
  const alternatives = allocationAlternatives(root) as PlanRequirementGroup[];
  let best: RequirementAllocation = new Map();
  let bestScore: number[] | null = null;
  for (const alternative of alternatives) {
    const allocation = allocateSingleAlternative({
      root: alternative,
      attempts,
      catalogue,
      pins,
      overrides,
      tdPossibility,
    });
    const progress = requirementTreeProgress({
      root: alternative,
      attempts,
      catalogue,
      allocation,
      overrides,
      structureCode: overrides[0]?.structureCode,
      tdPossibility,
      measureTdUncertainty: false,
    });
    const nodes = [...progress.values()];
    const rootProgress = progress.get(requirementNodeKey(root));
    const score = [
      [...pins].filter(([code, key]) => allocation.get(code)?.nodeKey === key)
        .length,
      Number(rootProgress?.state === "satisfied"),
      nodes.filter(
        (node) =>
          node.state === "satisfied" || node.state === "done-by-override",
      ).length,
      nodes.reduce(
        (sum, node) =>
          sum +
          Math.min(
            node.completedUnits + node.plannedUnits,
            node.targetUnits ?? node.maximumUnits ?? 0,
          ),
        0,
      ),
    ];
    if (
      !bestScore ||
      score.some(
        (value, index) =>
          value > bestScore![index]! &&
          score
            .slice(0, index)
            .every((prior, priorIndex) => prior === bestScore![priorIndex]),
      )
    ) {
      best = allocation;
      bestScore = score;
    }
  }
  return best;
}

/** Completed work first, then this semester's, then plans, each in plan order. */
function orderedCredit(credited: readonly CreditedAttempt[]) {
  const weight = (status: Attempt["status"]) =>
    status === "completed" ? 0 : status === "enrolled" ? 1 : 2;
  return credited
    .map((entry, index) => ({ entry, index }))
    .toSorted(
      (left, right) =>
        weight(left.entry.attempt.status) -
          weight(right.entry.attempt.status) || left.index - right.index,
    )
    .map(({ entry }) => entry);
}

function conditionProgress(
  condition: PlanRequirementCondition,
  scope: "part" | "degree",
  credited: readonly CreditedAttempt[],
  allocation: RequirementAllocation,
  overrides: readonly RequirementOverride[],
): RequirementNodeProgress {
  const key = requirementNodeKey(condition);
  const override = overrides.find(
    (item) => item.requirementKey === condition.projectionKey,
  );
  if (override)
    return {
      key,
      state: "done-by-override",
      override,
      creditedUnits: override.creditedUnits ?? 0,
      targetUnits: condition.minimumUnits,
      maximumUnits: condition.maximumUnits,
      targetCourses: condition.minimumCourses,
      completedUnits: override.creditedUnits ?? 0,
      plannedUnits: 0,
      matchedCourseCodes: [],
    };
  const sequence =
    condition.conditionKind === "consecutive_semester_pair"
      ? pairSequence(condition, credited)
      : null;
  const predicates = conditionPredicates(condition);
  // A part counts only what was allocated to it; a degree-wide rule reads
  // every course the degree counts, and the total reads them all.
  const counts = (entry: CreditedAttempt) => {
    if (!countsInDegree(entry, allocation)) return false;
    if (condition.conditionKind === "units_total") return true;
    if (scope === "degree")
      return predicates.some((matches) => matches(entry.course));
    return allocation.get(entry.course.code)?.nodeKey === key;
  };
  let completedUnits = 0;
  let plannedUnits = 0;
  // A repeated course is still one course towards a course count.
  const completedCodes = new Set<string>();
  const matchedCourseCodes: string[] = [];
  credited.forEach((entry) => {
    if (!counts(entry)) return;
    if (!matchedCourseCodes.includes(entry.course.code))
      matchedCourseCodes.push(entry.course.code);
    if (entry.attempt.status === "completed") {
      completedUnits += entry.units;
      completedCodes.add(entry.course.code);
    } else {
      plannedUnits += entry.units;
    }
  });
  const completedCourses = completedCodes.size;
  if (condition.conditionKind === "units_total")
    completedUnits += overrides.reduce(
      (sum, item) => sum + (item.creditedUnits ?? 0),
      0,
    );
  const overCap = [...allocation.values()].some(
    (placement) => placement.overCapKey === key,
  );
  const targetUnits = condition.minimumUnits;
  const maximumUnits = condition.maximumUnits;
  const targetCourses = condition.minimumCourses;
  const state = stateFromUnits({
    targetUnits,
    maximumUnits,
    targetCourses,
    completedUnits,
    plannedUnits,
    completedCourses,
    measurable:
      canMeasureRequirementCondition(condition) ||
      condition.conditionKind === "units_total",
  });
  return {
    key,
    state:
      sequence === "unknown" && matchedCourseCodes.length === 2
        ? "unmeasured"
        : overCap
          ? "over_limit"
          : state,
    targetUnits,
    maximumUnits,
    targetCourses,
    completedUnits,
    plannedUnits,
    matchedCourseCodes,
  };
}

/**
 * Combines child states the way the group's operator reads: every child for
 * `all_of`, one child for `any_of` and a count of children for
 * `minimum_count`. Unknown rules must not certify a group as satisfied.
 */
function groupStateFromChildren(
  group: PlanRequirementGroup,
  children: readonly RequirementNodeProgress[],
): RequirementNodeState {
  const measurable = children.filter((child) => child.state !== "unmeasured");
  if (measurable.length === 0) return "unmeasured";
  const satisfied = measurable.filter(
    (child) =>
      child.state === "satisfied" || child.state === "done-by-override",
  ).length;
  const active = measurable.some(
    (child) =>
      child.state === "satisfied" ||
      child.state === "done-by-override" ||
      child.state === "in_progress",
  );
  const required =
    group.operator === "any_of"
      ? 1
      : group.operator === "at_least"
        ? (group.minimumCount ?? 1)
        : children.length;
  if (satisfied >= required) return "satisfied";
  const possible = children.filter((child) => child.state !== "over_limit");
  if (possible.length < required) return "over_limit";
  if (children.some((child) => child.state === "unmeasured")) {
    return "unmeasured";
  }
  return active ? "in_progress" : "not_started";
}

function groupProgress(
  group: PlanRequirementGroup,
  inherited: "part" | "degree",
  mandatory: boolean,
  credited: readonly CreditedAttempt[],
  allocation: RequirementAllocation,
  into: Map<string, RequirementNodeProgress>,
  inUnitPool = false,
  overrides: readonly RequirementOverride[] = [],
): RequirementNodeProgress {
  const scope =
    inherited === "degree" || group.scope === "degree" ? "degree" : "part";
  const childrenMandatory = mandatory && group.operator === "all_of";
  const childUnitPool =
    inUnitPool ||
    (scope === "part" &&
      (group.minimumUnits !== null || group.maximumUnits !== null));
  const children = group.children.map((child) =>
    child.type === "condition"
      ? conditionProgress(
          child,
          effectiveScope(child, scope, childrenMandatory, childUnitPool),
          credited,
          allocation,
          overrides,
        )
      : groupProgress(
          child,
          scope,
          childrenMandatory,
          credited,
          allocation,
          into,
          childUnitPool,
          overrides,
        ),
  );
  children.forEach((child) => into.set(child.key, child));

  // Parts never share a course, and a degree-wide rule never uses one up, so
  // the union of the children's courses is what the group holds.
  const matchedCourseCodes = [
    ...new Set(children.flatMap((child) => child.matchedCourseCodes)),
  ];
  const matched = new Set(matchedCourseCodes);
  let completedUnits = 0;
  let plannedUnits = 0;
  const completedCodes = new Set<string>();
  credited.forEach((entry) => {
    if (!matched.has(entry.course.code) || !countsInDegree(entry, allocation))
      return;
    if (entry.attempt.status === "completed") {
      completedUnits += entry.units;
      completedCodes.add(entry.course.code);
    } else {
      plannedUnits += entry.units;
    }
  });
  const completedCourses = completedCodes.size;

  const creditedUnits = children.reduce(
    (sum, child) => sum + (child.creditedUnits ?? 0),
    0,
  );
  completedUnits += creditedUnits;
  const childState = groupStateFromChildren(group, children);
  const hasOwnTarget =
    group.minimumUnits !== null || group.maximumUnits !== null;
  const unitState = hasOwnTarget
    ? stateFromUnits({
        targetUnits: group.minimumUnits,
        maximumUnits: group.maximumUnits,
        targetCourses: null,
        completedUnits,
        plannedUnits,
        completedCourses,
        measurable: childState !== "unmeasured",
      })
    : childState;

  // A group with its own unit total is satisfied only when both the children
  // and the total agree; otherwise the stricter reading wins.
  const order: RequirementNodeState[] = [
    "over_limit",
    "not_started",
    "in_progress",
    "satisfied",
    "unmeasured",
  ];
  const state =
    unitState === "unmeasured"
      ? childState
      : childState === "unmeasured"
        ? "unmeasured"
        : order[Math.min(order.indexOf(unitState), order.indexOf(childState))];

  return {
    key: requirementNodeKey(group),
    state,
    creditedUnits,
    targetUnits: group.minimumUnits,
    maximumUnits: group.maximumUnits,
    targetCourses: null,
    completedUnits,
    plannedUnits,
    matchedCourseCodes,
  };
}

/**
 * Progress for every node in one published requirement tree, keyed by
 * `requirementNodeKey`, with each course allocated to one part of the degree
 * (see `allocateRequirements`). Rules Coursemap cannot evaluate are reported
 * as `unmeasured` rather than guessed at.
 */
export function requirementTreeProgress({
  root,
  attempts,
  catalogue,
  allocation,
  overrides = [],
  structureCode,
  tdPossibility = false,
  measureTdUncertainty = true,
}: {
  overrides?: readonly RequirementOverride[];
  structureCode?: string;
  tdPossibility?: boolean;
  measureTdUncertainty?: boolean;
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
  /** From `allocateRequirements`; computed without pins when absent. */
  allocation?: RequirementAllocation;
}): RequirementTreeProgress {
  const progress = new Map<string, RequirementNodeProgress>();
  if (!root) return progress;
  const credited = creditedAttempts(
    attempts,
    catalogue,
    repeatableCourseCodes(root),
    tdPossibility,
  );
  const requirementKeys = new Set(
    [...requirementConditionsByKey(root).values()].map(
      (condition) => condition.projectionKey,
    ),
  );
  const scopedOverrides = [
    ...new Map(
      overrides
        .filter(
          (item) =>
            item.structureCode === structureCode &&
            requirementKeys.has(item.requirementKey),
        )
        .map((item) => [item.requirementKey, item]),
    ).values(),
  ];
  const placements =
    allocation ??
    allocateRequirements({
      root,
      attempts,
      catalogue,
      overrides: scopedOverrides,
      tdPossibility,
    });
  const rootProgress = groupProgress(
    allocationRoot(root),
    "part",
    true,
    credited,
    placements,
    progress,
    false,
    scopedOverrides,
  );
  if (root.scope === "degree" && allocationRoot(root) !== root) {
    const total = credited.filter((entry) => countsInDegree(entry, placements));
    rootProgress.completedUnits = total
      .filter(({ attempt }) => attempt.status === "completed")
      .reduce(
        (sum, entry) => sum + entry.units,
        rootProgress.creditedUnits ?? 0,
      );
    rootProgress.plannedUnits = total
      .filter(({ attempt }) => attempt.status !== "completed")
      .reduce((sum, entry) => sum + entry.units, 0);
    rootProgress.matchedCourseCodes = [
      ...new Set(total.map(({ course }) => course.code)),
    ];
    if (
      root.maximumUnits !== null &&
      rootProgress.completedUnits + rootProgress.plannedUnits >
        root.maximumUnits
    )
      rootProgress.state = "over_limit";
  }
  progress.set(rootProgress.key, rootProgress);
  if (
    measureTdUncertainty &&
    containsTdRequirement(root) &&
    credited.some((entry) => entry.course.tdDesignation === "unknown")
  ) {
    const pins = new Map(
      [...placements].flatMap(([code, placement]) =>
        placement.pinned && placement.nodeKey
          ? [[code, placement.nodeKey] as const]
          : [],
      ),
    );
    const possibleAllocation = allocateRequirements({
      root,
      attempts,
      catalogue,
      pins,
      overrides: scopedOverrides,
      tdPossibility: true,
    });
    const possible = requirementTreeProgress({
      root,
      attempts,
      catalogue,
      allocation: possibleAllocation,
      overrides: scopedOverrides,
      structureCode,
      tdPossibility: true,
      measureTdUncertainty: false,
    });
    const update = (node: PlanRequirementNode): boolean => {
      const lower = progress.get(requirementNodeKey(node));
      if (!lower || lower.state === "done-by-override") return false;
      if (node.type === "condition") {
        if (
          node.conditionKind !== "tagged_units" ||
          !node.tag ||
          !isTdTag(node.tag)
        )
          return false;
        const upper = possible.get(lower.key);
        // An optimistic TD cap may exclude precisely the units whose
        // designation is unknown. That exclusion is itself uncertain.
        const uncertainCapUnits =
          node.maximumUnits === null
            ? 0
            : credited
                .filter(
                  (entry) =>
                    entry.course.tdDesignation === "unknown" &&
                    entry.attempt.status === "completed" &&
                    !entry.repeat &&
                    levelWithin(
                      entry.course.level,
                      node.minimumLevel,
                      node.maximumLevel,
                    ) &&
                    (countsInDegree(entry, placements) ||
                      possibleAllocation.get(entry.course.code)?.overCapKey ===
                        lower.key),
                )
                .reduce((sum, entry) => sum + entry.units, 0);
        const unknownUnits = Math.max(
          uncertainCapUnits,
          0,
          (upper?.completedUnits ?? 0) - lower.completedUnits,
        );
        if (!upper || unknownUnits === 0) return false;
        const couldReachUnits =
          node.minimumUnits !== null &&
          lower.completedUnits + lower.plannedUnits < node.minimumUnits &&
          upper.completedUnits + upper.plannedUnits >= node.minimumUnits;
        const couldExceedMaximum =
          node.maximumUnits !== null &&
          lower.completedUnits + lower.plannedUnits <= node.maximumUnits &&
          upper.completedUnits + upper.plannedUnits > node.maximumUnits;
        const completedCodes = new Set(
          credited
            .filter((entry) => entry.attempt.status === "completed")
            .map((entry) => entry.course.code),
        );
        const couldReachCourses =
          node.minimumCourses !== null &&
          lower.matchedCourseCodes.filter((code) => completedCodes.has(code))
            .length < node.minimumCourses &&
          upper.matchedCourseCodes.filter((code) => completedCodes.has(code))
            .length >= node.minimumCourses;
        const capCouldChangeResult =
          node.maximumUnits !== null &&
          lower.completedUnits + lower.plannedUnits + uncertainCapUnits >
            node.maximumUnits;
        if (
          node.minimumUnits === null &&
          node.minimumCourses === null &&
          !capCouldChangeResult &&
          !couldExceedMaximum
        )
          return false;
        lower.designationReview = {
          unknownUnits,
          detail: `${unknownUnits.toLocaleString()} completed units need their transdisciplinary designation checked.`,
        };
        if (
          couldReachUnits ||
          couldExceedMaximum ||
          couldReachCourses ||
          (capCouldChangeResult && lower.state !== "over_limit")
        )
          lower.state = "unmeasured";
        lower.designationReview.affectsResult = lower.state === "unmeasured";
        return true;
      }
      const changed = node.children.map(update).some(Boolean);
      if (changed) {
        const children = node.children
          .map((child) => progress.get(requirementNodeKey(child))!)
          .filter(Boolean);
        // Uncertain designation cannot erase an already established excess.
        if (
          lower.state !== "over_limit" &&
          groupStateFromChildren(node, children) === "unmeasured"
        )
          lower.state = "unmeasured";
      }
      return changed;
    };
    update(root);
  }
  return progress;
}

export type RequirementBucketStatus =
  "review" | "complete" | "scheduled" | "short" | "untargeted";

/**
 * How a group reads at a glance. Groups whose published rule states no unit
 * target cannot be judged complete, so they report "untargeted" rather than
 * borrowing a target from the units that happen to be mapped.
 */
export function requirementBucketStatus(bucket: RequirementBucketProgress): {
  status: RequirementBucketStatus;
  label: string;
} {
  if (bucket.satisfiedByOverride)
    return { status: "complete", label: "Marked satisfied" };
  if (bucket.designationReview?.affectsResult)
    return { status: "review", label: "Review designation" };
  const target = bucket.targetUnits;
  if (target === null || target === 0)
    return {
      status: "untargeted",
      label: `${bucket.completedUnits + bucket.plannedUnits} units mapped`,
    };
  if (bucket.completedUnits >= target)
    return { status: "complete", label: "Complete" };
  if (bucket.completedUnits + bucket.plannedUnits >= target)
    return { status: "scheduled", label: "Scheduled" };
  const shortfall = target - bucket.completedUnits - bucket.plannedUnits;
  const possible = Math.max(
    0,
    shortfall - (bucket.designationReview?.unknownUnits ?? 0),
  );
  return {
    status: "short",
    label:
      possible < shortfall
        ? `${possible} to ${shortfall}u short`
        : `${shortfall}u short`,
  };
}

/**
 * The parts of a degree one course may count towards, most specific first,
 * for a student choosing where it goes. Degree-wide rules are left out: they
 * read every course and are never a place to put one.
 */
export function placementOptions({
  root,
  course,
}: {
  root: PlanRequirementGroup | null;
  course: MatchableCourse;
}): string[] {
  if (!root) return [];
  const leaves: Leaf[] = [];
  collectLeaves(allocationRoot(root), "part", true, leaves);
  return leaves
    .filter(
      (leaf) =>
        leaf.scope === "part" && leaf.node.conditionKind !== "units_total",
    )
    .map((leaf) => ({ key: leaf.key, rank: placementRank(leaf, course) }))
    .filter(
      (option): option is { key: string; rank: number } => option.rank !== null,
    )
    .toSorted((left, right) => left.rank - right.rank)
    .map(({ key }) => key);
}

/** Every condition in a tree by its node key, for naming where a course went. */
export function requirementConditionsByKey(root: PlanRequirementGroup | null) {
  const conditions = new Map<string, PlanRequirementCondition>();
  const visit = (node: PlanRequirementNode) => {
    if (node.type === "group") node.children.forEach(visit);
    else conditions.set(requirementNodeKey(node), node);
  };
  if (root) visit(root);
  return conditions;
}

/** Counts explicit credit only for rules still present in selected structures. */
export function creditedRequirementUnits(
  requirements: readonly PlanStructureRequirements[],
  overrides: readonly RequirementOverride[],
  selectedCodes: ReadonlySet<string>,
) {
  return requirements
    .filter((structure) => selectedCodes.has(structure.structureCode))
    .reduce((total, structure) => {
      const keys = new Set(
        [...requirementConditionsByKey(structure.root).values()].map(
          (condition) => condition.projectionKey,
        ),
      );
      const creditByKey = new Map(
        overrides
          .filter(
            (item) =>
              item.structureCode === structure.structureCode &&
              keys.has(item.requirementKey),
          )
          .map((item) => [item.requirementKey, item.creditedUnits ?? 0]),
      );
      return (
        total + [...creditByKey.values()].reduce((sum, units) => sum + units, 0)
      );
    }, 0);
}
