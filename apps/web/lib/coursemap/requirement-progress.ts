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

type MatchableCourse = { code: string; subject: string; level: number };
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
  >,
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
  if (condition.conditionKind === "subject" && condition.subjectCode) {
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
  } else if (condition.conditionKind === "level") {
    predicates.push((course) =>
      levelWithin(course.level, condition.minimumLevel, condition.maximumLevel),
    );
  }
  return predicates;
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
  >,
) {
  return (
    conditionPredicates(condition).length > 0 &&
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

type CreditedAttempt = {
  attempt: Attempt;
  course: MatchableCourse & { units?: number };
  units: number;
};

function creditedAttempts(
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

function conditionProgress(
  condition: PlanRequirementCondition,
  credited: readonly CreditedAttempt[],
): RequirementNodeProgress {
  const predicates = conditionPredicates(condition);
  let completedUnits = 0;
  let plannedUnits = 0;
  let completedCourses = 0;
  const matchedCourseCodes: string[] = [];
  credited.forEach(({ attempt, course, units }) => {
    if (!predicates.some((matches) => matches(course))) return;
    matchedCourseCodes.push(course.code);
    if (attempt.status === "completed") {
      completedUnits += units;
      completedCourses += 1;
    } else {
      plannedUnits += units;
    }
  });
  const targetUnits = condition.minimumUnits;
  const maximumUnits = condition.maximumUnits;
  const targetCourses = condition.minimumCourses;
  return {
    key: requirementNodeKey(condition),
    state: stateFromUnits({
      targetUnits,
      maximumUnits,
      targetCourses,
      completedUnits,
      plannedUnits,
      completedCourses,
      measurable: canMeasureRequirementCondition(condition),
    }),
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
      : group.operator === "minimum_count"
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
  credited: readonly CreditedAttempt[],
  into: Map<string, RequirementNodeProgress>,
): RequirementNodeProgress {
  const children = group.children.map((child) =>
    child.type === "condition"
      ? conditionProgress(child, credited)
      : groupProgress(child, credited, into),
  );
  children.forEach((child) => into.set(child.key, child));

  // Units roll up through the union of matched courses so a course that
  // satisfies two sibling rules is only counted once for the parent.
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
 * `requirementNodeKey`. The requirements page uses this to show each rule's
 * completed, planned and remaining units with a satisfied state.
 *
 * This is an indicative reading, not a formal audit: a course may legitimately
 * count toward several rules, and rules Coursemap cannot evaluate are reported
 * as `unmeasured` rather than guessed at.
 */
export function requirementTreeProgress({
  root,
  attempts,
  catalogue,
}: {
  root: PlanRequirementGroup | null;
  attempts: readonly Attempt[];
  catalogue: PlanningCatalogue;
}): RequirementTreeProgress {
  const progress = new Map<string, RequirementNodeProgress>();
  if (!root) return progress;
  const credited = creditedAttempts(attempts, catalogue);
  const rootProgress = groupProgress(root, credited, progress);
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
