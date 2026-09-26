import type {
  PlanRequirementCondition,
  PlanRequirementGroup,
  PlanRequirementNode,
  PlanStructureRequirements,
} from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import {
  isActiveAttempt,
  planningCourseForAttempt,
  unitsForAttempt,
  type PlanningCatalogue,
} from "@/lib/planner";

export type RequirementBucketProgress = {
  key: string;
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
        course.subject === subject &&
        levelWithin(
          course.level,
          condition.minimumLevel,
          condition.maximumLevel,
        ),
    );
  } else if (condition.conditionKind === "level_units") {
    predicates.push((course) =>
      levelWithin(course.level, condition.minimumLevel, condition.maximumLevel),
    );
  } else if (condition.conditionKind === "tagged_units" && condition.tag) {
    // A tag is one category however it is capitalised.
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
  return (
    (conditionPredicates(condition).length > 0 || takesAnyCourse(condition)) &&
    (condition.minimumUnits !== null ||
      condition.maximumUnits !== null ||
      condition.minimumCourses !== null)
  );
}

function collectPredicates(node: PlanRequirementNode): CoursePredicate[] {
  if (node.type === "condition") return conditionPredicates(node);
  return node.children.flatMap(collectPredicates);
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

/** Keep earned credit even when a later planned entry repeats the course. */
function activeAttempts(attempts: readonly Attempt[]) {
  const byCourse = new Map<string, Attempt>();
  attempts.filter(isActiveAttempt).forEach((attempt) => {
    if (byCourse.get(attempt.courseCode)?.status !== "completed") {
      byCourse.set(attempt.courseCode, attempt);
    }
  });
  return [...byCourse.values()];
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
}: {
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

  const credited = creditedAttempts(attempts, catalogue);

  return buckets.map(({ node, title, description, predicates }) => {
    let completedUnits = 0;
    let plannedUnits = 0;
    credited.forEach(({ attempt, course, units }) => {
      if (!predicates.some((matches) => matches(course))) return;
      if (attempt.status === "completed") completedUnits += units;
      else plannedUnits += units;
    });
    return {
      key: `${node.type}-${node.id}`,
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
  "satisfied" | "in_progress" | "not_started" | "over_limit" | "unmeasured";

export type RequirementNodeProgress = {
  key: string;
  state: RequirementNodeState;
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
};

/** Active plan entries, one per course, with the catalogue row they credit. */
export function creditedAttempts(
  attempts: readonly Attempt[],
  catalogue: PlanningCatalogue,
): CreditedAttempt[] {
  return activeAttempts(attempts).flatMap((attempt) => {
    const course = planningCourseForAttempt(attempt, catalogue);
    if (!course) return [];
    return [{ attempt, course, units: unitsForAttempt(attempt, course) }];
  });
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
};

export type RequirementAllocation = ReadonlyMap<string, CoursePlacement>;

type Leaf = {
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
) {
  const scope =
    inherited === "degree" || node.scope === "degree" ? "degree" : "part";
  if (node.type === "group") {
    node.children.forEach((child) =>
      collectLeaves(
        child,
        scope,
        mandatory && node.operator === "all_of",
        into,
      ),
    );
    return;
  }
  into.push({
    node,
    key: requirementNodeKey(node),
    scope: effectiveScope(node, scope, mandatory),
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
): "part" | "degree" {
  return inherited === "degree" ||
    condition.scope === "degree" ||
    (mandatory && isCap(condition))
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
export function allocateRequirements({
  root,
  attempts,
  catalogue,
  pins = new Map(),
}: {
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
  /** A student's chosen part for a course, by course code. */
  pins?: ReadonlyMap<string, string>;
}): RequirementAllocation {
  const placements = new Map<string, CoursePlacement>();
  if (!root) return placements;
  const leaves: Leaf[] = [];
  collectLeaves(root, "part", true, leaves);
  const credited = orderedCredit(creditedAttempts(attempts, catalogue));

  // Caps across the degree decide what may count at all.
  const excluded = new Map<string, string>();
  for (const leaf of leaves) {
    const cap = leaf.node.maximumUnits;
    if (leaf.scope !== "degree" || !leaf.mandatory || cap === null) continue;
    let used = 0;
    for (const { course, units } of credited) {
      if (excluded.has(course.code)) continue;
      if (!leaf.predicates.some((matches) => matches(course))) continue;
      if (used + units > cap) excluded.set(course.code, leaf.key);
      else used += units;
    }
  }

  const parts = leaves.filter(
    (leaf) =>
      leaf.scope === "part" && leaf.node.conditionKind !== "units_total",
  );
  const used = new Map<string, number>();
  const candidatesFor = (course: MatchableCourse) =>
    parts
      .map((leaf) => ({ leaf, rank: placementRank(leaf, course) }))
      .filter(
        (candidate): candidate is { leaf: Leaf; rank: number } =>
          candidate.rank !== null,
      );
  const queue = credited
    .filter(({ course }) => !excluded.has(course.code))
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
    const room = candidates.filter(({ leaf }) => {
      const maximum = leaf.node.maximumUnits;
      return maximum === null || (used.get(leaf.key) ?? 0) + units <= maximum;
    });
    const pinnedKey = pins.get(course.code);
    const pinned = room.find(({ leaf }) => leaf.key === pinnedKey);
    const needing = (leaf: Leaf) => {
      const target = leaf.node.minimumUnits;
      return target === null || (used.get(leaf.key) ?? 0) < target;
    };
    const chosen =
      pinned ??
      room
        .filter(({ leaf }) => needing(leaf))
        .toSorted((left, right) => left.rank - right.rank)[0] ??
      room.toSorted((left, right) => left.rank - right.rank)[0];
    if (chosen) {
      used.set(chosen.leaf.key, (used.get(chosen.leaf.key) ?? 0) + units);
    }
    placements.set(course.code, {
      nodeKey: chosen?.leaf.key ?? null,
      pinned: Boolean(pinned),
      overCapKey: null,
    });
  }
  for (const [code, capKey] of excluded) {
    placements.set(code, { nodeKey: null, pinned: false, overCapKey: capKey });
  }
  return placements;
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
): RequirementNodeProgress {
  const key = requirementNodeKey(condition);
  const predicates = conditionPredicates(condition);
  // A part counts only what was allocated to it; a degree-wide rule reads
  // every course the degree counts, and the total reads them all.
  const counts = ({ course }: CreditedAttempt) => {
    const placement = allocation.get(course.code);
    if (placement?.overCapKey) return false;
    if (condition.conditionKind === "units_total") return true;
    if (scope === "degree")
      return predicates.some((matches) => matches(course));
    return placement?.nodeKey === key;
  };
  let completedUnits = 0;
  let plannedUnits = 0;
  let completedCourses = 0;
  const matchedCourseCodes: string[] = [];
  credited.forEach((entry) => {
    if (!counts(entry)) return;
    matchedCourseCodes.push(entry.course.code);
    if (entry.attempt.status === "completed") {
      completedUnits += entry.units;
      completedCourses += 1;
    } else {
      plannedUnits += entry.units;
    }
  });
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
    state: overCap ? "over_limit" : state,
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
    (child) => child.state === "satisfied",
  ).length;
  const active = measurable.some(
    (child) => child.state === "satisfied" || child.state === "in_progress",
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
): RequirementNodeProgress {
  const scope =
    inherited === "degree" || group.scope === "degree" ? "degree" : "part";
  const childrenMandatory = mandatory && group.operator === "all_of";
  const children = group.children.map((child) =>
    child.type === "condition"
      ? conditionProgress(
          child,
          effectiveScope(child, scope, childrenMandatory),
          credited,
          allocation,
        )
      : groupProgress(
          child,
          scope,
          childrenMandatory,
          credited,
          allocation,
          into,
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
  let completedCourses = 0;
  credited.forEach(({ attempt, course, units }) => {
    if (!matched.has(course.code)) return;
    if (attempt.status === "completed") {
      completedUnits += units;
      completedCourses += 1;
    } else {
      plannedUnits += units;
    }
  });

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
}: {
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
  /** From `allocateRequirements`; computed without pins when absent. */
  allocation?: RequirementAllocation;
}): RequirementTreeProgress {
  const progress = new Map<string, RequirementNodeProgress>();
  if (!root) return progress;
  const credited = creditedAttempts(attempts, catalogue);
  const placements =
    allocation ?? allocateRequirements({ root, attempts, catalogue });
  const rootProgress = groupProgress(
    root,
    "part",
    true,
    credited,
    placements,
    progress,
  );
  progress.set(rootProgress.key, rootProgress);
  return progress;
}

export type RequirementBucketStatus =
  "complete" | "scheduled" | "short" | "untargeted";

/**
 * How a group reads at a glance. Groups whose published rule states no unit
 * target cannot be judged complete, so they report "untargeted" rather than
 * borrowing a target from the units that happen to be mapped.
 */
export function requirementBucketStatus(bucket: RequirementBucketProgress): {
  status: RequirementBucketStatus;
  label: string;
} {
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
  return {
    status: "short",
    label: `${target - bucket.completedUnits - bucket.plannedUnits}u short`,
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
  collectLeaves(root, "part", true, leaves);
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
