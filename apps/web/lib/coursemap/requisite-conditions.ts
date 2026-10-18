import {
  type EnrolmentMode,
  validEnrolmentMode,
  enrolmentModeConditionLabel,
} from "../academic/enrolment-mode.ts";
import {
  commencementYearLabel,
  validCommencementYearBounds,
} from "../academic/commencement-year.ts";
import { courseFilterLabel } from "../academic/course-code.ts";
import {
  careerConditionLabel,
  type ProgrammeCareer,
  validProgrammeCareer,
} from "../academic/programme-career.ts";
import {
  requirementNoteKind,
  type RequirementNoteKind,
} from "../catalogue/note-kinds.ts";
export const REVIEWED_OPERATORS = ["all_of", "any_of", "at_least"] as const;

export type ReviewedOperator = (typeof REVIEWED_OPERATORS)[number];

export const REVIEWED_CONDITION_KINDS = [
  "course",
  "incompatible",
  "incompatible_concurrent",
  "structure",
  "units_total",
  "subject_units",
  "subject_courses",
  "course_count",
  "filtered_units",
  "level_units",
  "course_set_units",
  "year_standing",
  "commencement_year",
  "enrolment_mode",
  "college_enrolment",
  "career",
  "gpa",
  "wam",
  "field_units",
  "subject_sequence",
  "permission",
  "other",
] as const;

export type ReviewedConditionKind = (typeof REVIEWED_CONDITION_KINDS)[number];

export const MAX_REVIEWED_GROUP_DEPTH = 5;

export type ReviewedConditionInput = {
  kind: ReviewedConditionKind;
  /** Advisory is a soft requirement: shown to students, never blocking. */
  hardness?: "hard" | "advisory";
  courseCode?: string | null;
  courseRequirementMode?: "completed" | "completed_or_concurrent" | null;
  structureCode?: string | null;
  units?: number | null;
  courseCount?: number | null;
  courseCodes?: string[] | null;
  subjectCode?: string | null;
  level?: number | null;
  minimumYear?: number | null;
  enrolmentMode?: EnrolmentMode | null;
  matchesEnrolmentMode?: boolean | null;
  /** Subject and level filters of a course count or filtered unit total. */
  subjectCodes?: string[] | null;
  courseLevels?: number[] | null;
  career?: ProgrammeCareer | null;
  matchesCareer?: boolean | null;
  minimumCommencementYear?: number | null;
  maximumCommencementYear?: number | null;
  gpa?: number | null;
  recentGradedUnits?: number | null;
  wam?: number | null;
  mark?: number | null;
  freeText?: string | null;
  /**
   * How an `other` note is labelled. A labelled note is always advisory: it
   * is shown to students and never checked.
   */
  noteKind?: RequirementNoteKind | null;
  /** False for "not enrolled in" a programme or structure. */
  matchesStructure?: boolean | null;
};

export type ReviewedConditionView = ReviewedConditionInput & {
  courseTitle?: string | null;
  structureName?: string | null;
};

export type ReviewedConditionNode = ReviewedConditionView & {
  type: "condition";
  id: string;
};

export type ReviewedGroupNode = {
  type: "group";
  id: string;
  operator: ReviewedOperator;
  minimumCount: number | null;
  children: ReviewedRuleNode[];
};

export type ReviewedRuleNode = ReviewedConditionNode | ReviewedGroupNode;

export type ReviewedRuleTree = ReviewedGroupNode;

export type ReviewedTreeInput = {
  id?: string;
  operator: string;
  minimumCount?: number | null;
  children?: ReviewedTreeChildInput[];
  conditions?: ReviewedConditionInput[];
};

export type ReviewedTreeChildInput =
  | ({ type?: "condition"; id?: string } & ReviewedConditionInput)
  | (ReviewedTreeInput & { type: "group" });

export type StoredRuleGroup = {
  id: number;
  parentId: number | null;
  operator: string;
  minimumCount: number | null;
  position: number;
};

export type StoredRuleCondition = {
  id: number;
  groupId: number;
  kind: string;
  courseCode: string | null;
  courseTitle: string | null;
  structureCode: string | null;
  structureName: string | null;
  units: number | null;
  courseCount?: number | null;
  subjectCode: string | null;
  level: number | null;
  gpa: number | null;
  recentGradedUnits?: number | null;
  minimumYear?: number | null;
  enrolmentMode?: EnrolmentMode | null;
  matchesEnrolmentMode?: boolean | null;
  subjectCodes?: string[] | null;
  courseLevels?: number[] | null;
  courseRequirementMode?: "completed" | "completed_or_concurrent" | null;
  career?: ProgrammeCareer | null;
  matchesCareer?: boolean | null;
  minimumCommencementYear?: number | null;
  maximumCommencementYear?: number | null;
  wam?: number | null;
  courseCodes?: string[] | null;
  mark: number | null;
  freeText: string | null;
  noteKind?: string | null;
  matchesStructure?: boolean | null;
  sourceText: string | null;
  confidence: number;
  reviewState: string;
  position: number;
};

const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const SUBJECT_CODE_PATTERN = /^[A-Z]{4}$/u;
const STRUCTURE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/u;

function newNodeId() {
  return crypto.randomUUID();
}

export function createEmptyTree(id = "root"): ReviewedRuleTree {
  return {
    type: "group",
    id,
    operator: "all_of",
    minimumCount: null,
    children: [],
  };
}

export function createConditionNode(
  kind: ReviewedConditionKind = "course",
): ReviewedConditionNode {
  return { type: "condition", id: newNodeId(), kind };
}

export function createGroupNode(
  operator: ReviewedOperator = "all_of",
): ReviewedGroupNode {
  return {
    type: "group",
    id: newNodeId(),
    operator,
    minimumCount: operator === "at_least" ? 1 : null,
    children: [createConditionNode("course")],
  };
}

export function countReviewedLeaves(node: ReviewedRuleNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce(
    (total, child) => total + countReviewedLeaves(child),
    0,
  );
}

export function isEmptyReviewedTree(tree: ReviewedRuleTree) {
  return countReviewedLeaves(tree) === 0;
}

export function findInTree(
  node: ReviewedRuleNode,
  id: string,
): ReviewedRuleNode | null {
  if (node.id === id) return node;
  if (node.type !== "group") return null;
  for (const child of node.children) {
    const found = findInTree(child, id);
    if (found) return found;
  }
  return null;
}

export function findParentId(
  tree: ReviewedGroupNode,
  id: string,
): string | null {
  for (const child of tree.children) {
    if (child.id === id) return tree.id;
    if (child.type === "group") {
      const found = findParentId(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function groupDepth(
  tree: ReviewedGroupNode,
  groupId: string,
  depth = 1,
): number | null {
  if (tree.id === groupId) return depth;
  for (const child of tree.children) {
    if (child.type === "group") {
      const found = groupDepth(child, groupId, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

export function updateTree(
  tree: ReviewedGroupNode,
  id: string,
  updater: (node: ReviewedRuleNode) => ReviewedRuleNode,
): ReviewedGroupNode {
  if (tree.id === id) {
    const next = updater(tree);
    return next.type === "group" ? next : tree;
  }
  return {
    ...tree,
    children: tree.children.map((child) => {
      if (child.id === id) return updater(child);
      return child.type === "group" ? updateTree(child, id, updater) : child;
    }),
  };
}

export function removeFromTree(
  tree: ReviewedGroupNode,
  id: string,
): ReviewedGroupNode {
  if (tree.id === id) return tree;
  return {
    ...tree,
    children: tree.children
      .filter((child) => child.id !== id)
      .map((child) =>
        child.type === "group" ? removeFromTree(child, id) : child,
      ),
  };
}

/** Drop nested groups that no longer hold anything. The root may stay empty. */
export function pruneEmptyGroups(tree: ReviewedGroupNode): ReviewedGroupNode {
  const children: ReviewedRuleNode[] = [];
  for (const child of tree.children) {
    if (child.type !== "group") {
      children.push(child);
      continue;
    }
    const next = pruneEmptyGroups(child);
    if (next.children.length > 0) children.push(next);
  }
  return { ...tree, children };
}

export function deleteFromTree(
  tree: ReviewedGroupNode,
  id: string,
): ReviewedGroupNode {
  return pruneEmptyGroups(removeFromTree(tree, id));
}

export function addChild(
  tree: ReviewedGroupNode,
  groupId: string,
  child: ReviewedRuleNode,
): ReviewedGroupNode {
  return updateTree(tree, groupId, (group) =>
    group.type === "group"
      ? { ...group, children: [...group.children, child] }
      : group,
  );
}

/** Add a nested group that can be switched between and and or afterwards. */
export function addNestedSection(
  tree: ReviewedGroupNode,
  groupId: string,
): ReviewedGroupNode {
  return addChild(tree, groupId, createGroupNode("all_of"));
}

/** Where a node sits among its siblings, for ordered drops and insertions. */
export function childIndex(tree: ReviewedGroupNode, nodeId: string) {
  const parentId = findParentId(tree, nodeId);
  if (!parentId) return null;
  const parent = findInTree(tree, parentId);
  if (!parent || parent.type !== "group") return null;
  const index = parent.children.findIndex((child) => child.id === nodeId);
  return index < 0 ? null : index;
}

export function addSibling(
  tree: ReviewedGroupNode,
  siblingId: string,
  node: ReviewedRuleNode,
): ReviewedGroupNode {
  const parentId = findParentId(tree, siblingId);
  if (!parentId) return tree;
  const index = childIndex(tree, siblingId);
  return updateTree(tree, parentId, (group) => {
    if (group.type !== "group") return group;
    const children = [...group.children];
    children.splice(index == null ? children.length : index + 1, 0, node);
    return { ...group, children };
  });
}

export function isDescendant(
  tree: ReviewedGroupNode,
  ancestorId: string,
  nodeId: string,
) {
  if (ancestorId === nodeId) return false;
  const ancestor = findInTree(tree, ancestorId);
  return ancestor != null && findInTree(ancestor, nodeId) != null;
}

export function moveInTree(
  tree: ReviewedGroupNode,
  nodeId: string,
  targetGroupId: string,
  index?: number,
): ReviewedGroupNode {
  if (nodeId === targetGroupId || nodeId === tree.id) return tree;
  if (isDescendant(tree, nodeId, targetGroupId)) return tree;
  const node = findInTree(tree, nodeId);
  if (!node) return tree;
  const stripped = removeFromTree(tree, nodeId);
  return pruneEmptyGroups(
    updateTree(stripped, targetGroupId, (group) => {
      if (group.type !== "group") return group;
      const next = [...group.children];
      const at = Math.min(index ?? next.length, next.length);
      next.splice(at, 0, node);
      return { ...group, children: next };
    }),
  );
}

export function setGroupOperator(
  tree: ReviewedGroupNode,
  groupId: string,
  operator: ReviewedOperator,
  minimumCount?: number,
): ReviewedGroupNode {
  return updateTree(tree, groupId, (group) => {
    if (group.type !== "group") return group;
    if (operator === "at_least") {
      const count = minimumCount ?? Math.max(1, group.children.length);
      return { ...group, operator, minimumCount: count };
    }
    return { ...group, operator, minimumCount: null };
  });
}

export function isImporterOwnedRule(rule: {
  confidence: number;
  reviewState: string;
  sourceText: string;
  groups: StoredRuleGroup[];
  conditions: StoredRuleCondition[];
}) {
  if (rule.reviewState === "automatic" && rule.confidence === 1) return true;
  const root = rule.groups.find((group) => group.parentId === null);
  const leaf = rule.conditions[0];
  return (
    rule.reviewState === "review" &&
    rule.confidence === 0 &&
    rule.groups.length === 1 &&
    rule.conditions.length === 1 &&
    root != null &&
    root.operator === "all_of" &&
    root.minimumCount == null &&
    root.position === 0 &&
    leaf?.kind === "other" &&
    leaf.freeText === rule.sourceText &&
    leaf.sourceText === rule.sourceText &&
    leaf.confidence === 0 &&
    leaf.reviewState === "review" &&
    leaf.position === 0
  );
}

export function reviewedTreeFromStored(rule: {
  confidence: number;
  reviewState: string;
  sourceText: string;
  groups: StoredRuleGroup[];
  conditions: StoredRuleCondition[];
}): ReviewedRuleTree | null {
  if (isImporterOwnedRule(rule)) return null;
  const root = rule.groups.find((group) => group.parentId === null);
  if (!root) return null;
  return storedGroupToTree(root, rule.groups, rule.conditions);
}

function storedGroupToTree(
  group: StoredRuleGroup,
  groups: StoredRuleGroup[],
  conditions: StoredRuleCondition[],
): ReviewedGroupNode {
  const operator = REVIEWED_OPERATORS.includes(
    group.operator as ReviewedOperator,
  )
    ? (group.operator as ReviewedOperator)
    : "all_of";
  const childGroups = groups
    .filter((item) => item.parentId === group.id)
    .map((item) => ({
      position: item.position,
      node: storedGroupToTree(item, groups, conditions),
    }));
  const leaves = conditions
    .filter((condition) => condition.groupId === group.id)
    .flatMap((condition) => {
      const view = storedConditionToView(condition);
      return view
        ? [
            {
              position: condition.position,
              node: {
                ...view,
                type: "condition" as const,
                id: `condition-${condition.id}`,
              },
            },
          ]
        : [];
    });
  const children = [...childGroups, ...leaves]
    .sort((left, right) => left.position - right.position)
    .map((item) => item.node);
  return {
    type: "group",
    id: `group-${group.id}`,
    operator,
    minimumCount:
      operator === "at_least"
        ? (group.minimumCount ?? Math.max(1, children.length))
        : null,
    children,
  };
}

function storedConditionToView(
  condition: StoredRuleCondition,
): ReviewedConditionView | null {
  switch (condition.kind) {
    case "course":
      return condition.courseCode
        ? {
            kind: "course",
            courseCode: condition.courseCode,
            courseTitle: condition.courseTitle,
            mark: condition.mark,
          }
        : null;
    case "incompatible":
    case "incompatible_concurrent":
      return condition.courseCode
        ? {
            kind: condition.kind,
            courseCode: condition.courseCode,
            courseTitle: condition.courseTitle,
          }
        : null;
    case "structure":
      return condition.structureCode || condition.freeText
        ? {
            kind: "structure",
            structureCode: condition.structureCode,
            structureName: condition.structureName,
            freeText: condition.freeText,
            ...(condition.matchesStructure === false
              ? { matchesStructure: false }
              : {}),
          }
        : null;
    case "units_total":
      return condition.units != null
        ? { kind: "units_total", units: condition.units }
        : null;
    case "subject_units":
      return condition.units != null && condition.subjectCode
        ? {
            kind: "subject_units",
            units: condition.units,
            subjectCode: condition.subjectCode,
          }
        : null;
    case "subject_courses":
      return condition.courseCount != null && condition.subjectCode
        ? {
            kind: "subject_courses",
            courseCount: condition.courseCount,
            subjectCode: condition.subjectCode,
          }
        : null;
    case "level_units":
      return condition.units != null && condition.level != null
        ? {
            kind: "level_units",
            units: condition.units,
            level: condition.level,
            subjectCode: condition.subjectCode,
          }
        : null;
    case "course_set_units":
      return condition.units != null && condition.courseCodes?.length
        ? {
            kind: "course_set_units",
            units: condition.units,
            courseCodes: condition.courseCodes,
          }
        : null;
    case "course_count":
    case "filtered_units":
      return (condition.kind === "course_count"
        ? condition.courseCount != null
        : condition.units != null) &&
        (condition.subjectCodes?.length || condition.courseLevels?.length)
        ? {
            kind: condition.kind,
            ...(condition.kind === "course_count"
              ? { courseCount: condition.courseCount }
              : { units: condition.units }),
            subjectCodes: condition.subjectCodes ?? null,
            courseLevels: condition.courseLevels ?? null,
            courseRequirementMode:
              condition.courseRequirementMode ?? "completed",
          }
        : null;
    case "career":
      return validProgrammeCareer(condition.career) &&
        typeof condition.matchesCareer === "boolean"
        ? {
            kind: "career",
            career: condition.career,
            matchesCareer: condition.matchesCareer,
          }
        : null;
    case "college_enrolment":
      return condition.freeText?.trim()
        ? { kind: "college_enrolment", freeText: condition.freeText }
        : null;
    case "enrolment_mode":
      return validEnrolmentMode(condition.enrolmentMode) &&
        typeof condition.matchesEnrolmentMode === "boolean"
        ? {
            kind: "enrolment_mode",
            enrolmentMode: condition.enrolmentMode,
            matchesEnrolmentMode: condition.matchesEnrolmentMode,
          }
        : null;
    case "commencement_year":
      return validCommencementYearBounds(condition)
        ? {
            kind: "commencement_year",
            minimumCommencementYear: condition.minimumCommencementYear ?? null,
            maximumCommencementYear: condition.maximumCommencementYear ?? null,
          }
        : null;
    case "year_standing":
      return condition.minimumYear != null
        ? { kind: "year_standing", minimumYear: condition.minimumYear }
        : null;
    case "gpa":
      return condition.gpa != null
        ? {
            kind: "gpa",
            gpa: condition.gpa,
            ...(condition.recentGradedUnits != null
              ? { recentGradedUnits: condition.recentGradedUnits }
              : {}),
          }
        : null;
    case "wam":
      return condition.wam != null
        ? {
            kind: "wam",
            wam: condition.wam,
            ...(condition.recentGradedUnits != null
              ? { recentGradedUnits: condition.recentGradedUnits }
              : {}),
          }
        : null;
    case "field_units":
      return condition.units != null && condition.freeText
        ? {
            kind: "field_units",
            units: condition.units,
            freeText: condition.freeText,
          }
        : null;
    case "subject_sequence": {
      // The anchor course is stored as text rather than a catalogue item.
      const courseCode = condition.courseCode ?? condition.freeText;
      return condition.subjectCode && courseCode
        ? {
            kind: "subject_sequence",
            subjectCode: condition.subjectCode,
            courseCode,
          }
        : null;
    }
    case "permission":
      return condition.freeText
        ? { kind: "permission", freeText: condition.freeText }
        : null;
    case "other": {
      const noteKind = requirementNoteKind(condition.noteKind);
      return condition.freeText
        ? {
            kind: "other",
            freeText: condition.freeText,
            ...(noteKind ? { noteKind } : {}),
          }
        : null;
    }
    default:
      return null;
  }
}

export function validateReviewedTree(
  input: ReviewedTreeInput,
): { message: string } | { tree: ReviewedRuleTree } {
  return validateGroupInput(input, "root", 1, "Condition");
}

function validateGroupInput(
  input: ReviewedTreeInput,
  fallbackId: string,
  depth: number,
  label: string,
): { message: string } | { tree: ReviewedRuleTree } {
  if (depth > MAX_REVIEWED_GROUP_DEPTH) {
    return {
      message: `Nesting cannot go deeper than ${MAX_REVIEWED_GROUP_DEPTH} groups.`,
    };
  }
  if (!REVIEWED_OPERATORS.includes(input.operator as ReviewedOperator)) {
    return { message: "Choose how these conditions should match." };
  }
  const operator = input.operator as ReviewedOperator;
  const rawChildren =
    input.children ??
    (input.conditions ?? []).map((condition) => ({
      type: "condition" as const,
      ...condition,
    }));
  const children: ReviewedRuleNode[] = [];
  for (const [index, child] of rawChildren.entries()) {
    const childLabel = `${label} ${index + 1}`;
    if (child.type === "group") {
      const nested = validateGroupInput(
        child,
        `${fallbackId}-${index}`,
        depth + 1,
        childLabel,
      );
      if ("message" in nested) return nested;
      children.push(nested.tree);
      continue;
    }
    const normalised = normaliseCondition(child);
    if ("message" in normalised) {
      return { message: `${childLabel}: ${normalised.message}` };
    }
    if (
      child.hardness !== undefined &&
      child.hardness !== "hard" &&
      child.hardness !== "advisory"
    )
      return {
        message: `${childLabel}: Choose a hard or advisory requirement.`,
      };
    children.push({
      ...normalised.condition,
      // A labelled note is never checked, so it is always advisory.
      ...(normalised.condition.noteKind
        ? { hardness: "advisory" as const }
        : child.hardness === undefined
          ? {}
          : { hardness: child.hardness }),
      type: "condition",
      id: "id" in child && child.id ? child.id : `${fallbackId}-c${index}`,
    });
  }

  if (operator === "at_least") {
    const count = Number(input.minimumCount);
    if (
      children.length === 0 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > children.length
    ) {
      return {
        message:
          children.length === 0
            ? "Add conditions before using at least N."
            : `Choose how many of the ${children.length} items must match.`,
      };
    }
    return {
      tree: {
        type: "group",
        id: input.id ?? fallbackId,
        operator,
        minimumCount: count,
        children,
      },
    };
  }

  return {
    tree: {
      type: "group",
      id: input.id ?? fallbackId,
      operator,
      minimumCount: null,
      children,
    },
  };
}

/**
 * The subjects, courses or printed wording a grade average is limited to.
 * Each part is left out when empty, so an unscoped average is unchanged.
 */
function normaliseAverageScope(condition: ReviewedConditionInput):
  | { message: string }
  | {
      scope: Pick<
        ReviewedConditionView,
        "subjectCodes" | "courseCodes" | "freeText"
      >;
    } {
  const subjects = (condition.subjectCodes ?? []).map((code) =>
    code.trim().toUpperCase(),
  );
  const courses = (condition.courseCodes ?? []).map((code) =>
    code.trim().toUpperCase(),
  );
  const freeText = (condition.freeText ?? "").trim();
  if (subjects.some((code) => !SUBJECT_CODE_PATTERN.test(code)))
    return { message: "Each subject must be a four-letter code." };
  if (courses.some((code) => !COURSE_CODE_PATTERN.test(code)))
    return { message: "Choose valid course codes for the average." };
  if (
    new Set(subjects).size !== subjects.length ||
    new Set(courses).size !== courses.length
  )
    return { message: "Each subject and course must be listed once." };
  return {
    scope: {
      ...(subjects.length ? { subjectCodes: subjects } : {}),
      ...(courses.length ? { courseCodes: courses } : {}),
      ...(freeText ? { freeText } : {}),
    },
  };
}

function normaliseCondition(
  condition: ReviewedConditionInput,
): { message: string } | { condition: ReviewedConditionView } {
  switch (condition.kind) {
    case "course": {
      const code = (condition.courseCode ?? "").trim().toUpperCase();
      if (!COURSE_CODE_PATTERN.test(code)) {
        return { message: "Choose a course code." };
      }
      const mark = condition.mark == null ? null : Number(condition.mark);
      if (mark != null && (!Number.isFinite(mark) || mark < 0 || mark > 100)) {
        return { message: "The course mark must be between 0 and 100." };
      }
      return {
        condition: {
          kind: "course",
          courseCode: code,
          mark,
          courseRequirementMode:
            condition.courseRequirementMode === "completed_or_concurrent"
              ? "completed_or_concurrent"
              : "completed",
        },
      };
    }
    case "incompatible":
    case "incompatible_concurrent": {
      const code = (condition.courseCode ?? "").trim().toUpperCase();
      if (!COURSE_CODE_PATTERN.test(code)) {
        return { message: "Choose a course code." };
      }
      return { condition: { kind: condition.kind, courseCode: code } };
    }
    case "structure": {
      const code = (condition.structureCode ?? "").trim().toUpperCase();
      const freeText = (condition.freeText ?? "").trim() || null;
      const negated =
        condition.matchesStructure === false ? { matchesStructure: false } : {};
      if (code) {
        if (!STRUCTURE_CODE_PATTERN.test(code)) {
          return { message: "Choose a programme code." };
        }
        return {
          condition: { kind: "structure", structureCode: code, ...negated },
        };
      }
      if (freeText)
        return { condition: { kind: "structure", freeText, ...negated } };
      return { message: "Choose a programme." };
    }
    case "units_total": {
      const units = Number(condition.units);
      if (!Number.isFinite(units) || units <= 0) {
        return { message: "Units must be greater than zero." };
      }
      return { condition: { kind: "units_total", units } };
    }
    case "subject_units": {
      const units = Number(condition.units);
      const subject = (condition.subjectCode ?? "").trim().toUpperCase();
      if (!Number.isFinite(units) || units <= 0) {
        return { message: "Units must be greater than zero." };
      }
      if (!SUBJECT_CODE_PATTERN.test(subject)) {
        return { message: "Subject must be a four-letter code." };
      }
      return {
        condition: { kind: "subject_units", units, subjectCode: subject },
      };
    }
    case "subject_courses": {
      const count = Number(condition.courseCount);
      const subject = (condition.subjectCode ?? "").trim().toUpperCase();
      if (!Number.isInteger(count) || count < 1 || count > 32767)
        return {
          message: "Course count must be a whole number between 1 and 32767.",
        };
      if (!SUBJECT_CODE_PATTERN.test(subject))
        return { message: "Subject must be a four-letter code." };
      return {
        condition: {
          kind: "subject_courses",
          courseCount: count,
          subjectCode: subject,
        },
      };
    }
    case "level_units": {
      const units = Number(condition.units);
      const level = Number(condition.level);
      const subject = (condition.subjectCode ?? "").trim().toUpperCase();
      if (!Number.isFinite(units) || units <= 0) {
        return { message: "Units must be greater than zero." };
      }
      if (!Number.isInteger(level) || level < 0 || level > 9999) {
        return { message: "Level must be a whole number between 0 and 9999." };
      }
      if (subject && !SUBJECT_CODE_PATTERN.test(subject)) {
        return { message: "Subject must be a four-letter code." };
      }
      return {
        condition: {
          kind: "level_units",
          units,
          level,
          subjectCode: subject || null,
        },
      };
    }
    case "course_set_units": {
      const units = Number(condition.units);
      const codes = (condition.courseCodes ?? []).map((code) =>
        code.trim().toUpperCase(),
      );
      if (!Number.isFinite(units) || units <= 0) {
        return { message: "Units must be greater than zero." };
      }
      if (
        codes.length === 0 ||
        codes.some((code) => !COURSE_CODE_PATTERN.test(code))
      ) {
        return { message: "Choose at least one valid course code." };
      }
      if (new Set(codes).size !== codes.length) {
        return { message: "Each course in the set must be unique." };
      }
      return {
        condition: { kind: "course_set_units", units, courseCodes: codes },
      };
    }
    case "course_count":
    case "filtered_units": {
      const subjects = condition.subjectCodes?.length
        ? condition.subjectCodes.map((code) => code.trim().toUpperCase())
        : null;
      const levels = condition.courseLevels?.length
        ? condition.courseLevels.map(Number)
        : null;
      if (subjects?.some((code) => !SUBJECT_CODE_PATTERN.test(code)))
        return { message: "Each subject must be a four-letter code." };
      if (
        levels?.some(
          (level) => !Number.isInteger(level) || level < 0 || level > 9999,
        )
      )
        return {
          message: "Each level must be a whole number between 0 and 9999.",
        };
      if (!subjects && !levels)
        return { message: "Choose at least one subject or level." };
      if (
        (subjects && new Set(subjects).size !== subjects.length) ||
        (levels && new Set(levels).size !== levels.length)
      )
        return { message: "Each subject and level must be listed once." };
      const courseRequirementMode =
        condition.courseRequirementMode === "completed_or_concurrent"
          ? ("completed_or_concurrent" as const)
          : ("completed" as const);
      if (condition.kind === "course_count") {
        const count = Number(condition.courseCount);
        if (!Number.isInteger(count) || count < 1 || count > 32767)
          return {
            message: "Course count must be a whole number between 1 and 32767.",
          };
        return {
          condition: {
            kind: "course_count",
            courseCount: count,
            subjectCodes: subjects,
            courseLevels: levels,
            courseRequirementMode,
          },
        };
      }
      const units = Number(condition.units);
      if (!Number.isFinite(units) || units <= 0)
        return { message: "Units must be greater than zero." };
      return {
        condition: {
          kind: "filtered_units",
          units,
          subjectCodes: subjects,
          courseLevels: levels,
          courseRequirementMode,
        },
      };
    }
    case "career": {
      if (
        !validProgrammeCareer(condition.career) ||
        typeof condition.matchesCareer !== "boolean"
      )
        return { message: "Choose a career and whether it applies." };
      return {
        condition: {
          kind: "career",
          career: condition.career,
          matchesCareer: condition.matchesCareer,
        },
      };
    }
    case "college_enrolment": {
      const freeText = condition.freeText?.trim();
      if (!freeText)
        return { message: "Enter the college's full source name." };
      return { condition: { kind: "college_enrolment", freeText } };
    }
    case "enrolment_mode": {
      if (
        !validEnrolmentMode(condition.enrolmentMode) ||
        typeof condition.matchesEnrolmentMode !== "boolean"
      )
        return { message: "Choose an enrolment mode and whether it applies." };
      return {
        condition: {
          kind: "enrolment_mode",
          enrolmentMode: condition.enrolmentMode,
          matchesEnrolmentMode: condition.matchesEnrolmentMode,
        },
      };
    }
    case "commencement_year": {
      if (!validCommencementYearBounds(condition))
        return {
          message:
            "Choose an ordered commencement-year range between 1900 and 9999, with at least one bound.",
        };
      return {
        condition: {
          kind: "commencement_year",
          minimumCommencementYear: condition.minimumCommencementYear ?? null,
          maximumCommencementYear: condition.maximumCommencementYear ?? null,
        },
      };
    }
    case "year_standing": {
      const minimumYear = Number(condition.minimumYear);
      if (
        !Number.isInteger(minimumYear) ||
        minimumYear < 1 ||
        minimumYear > 10
      ) {
        return { message: "Year standing must be between 1 and 10." };
      }
      return { condition: { kind: "year_standing", minimumYear } };
    }
    case "gpa": {
      const gpa = Number(condition.gpa);
      if (!Number.isFinite(gpa) || gpa < 0 || gpa > 7) {
        return { message: "GPA must be between 0 and 7." };
      }
      const recentGradedUnits = condition.recentGradedUnits;
      if (
        recentGradedUnits != null &&
        (!Number.isInteger(recentGradedUnits) ||
          recentGradedUnits < 1 ||
          recentGradedUnits > 300)
      )
        return { message: "Recent graded units must be between 1 and 300." };
      const scope = normaliseAverageScope(condition);
      if ("message" in scope) return scope;
      if (recentGradedUnits != null && Object.keys(scope.scope).length)
        return {
          message: "Choose either recent graded units or a course scope.",
        };
      return {
        condition: {
          kind: "gpa",
          gpa,
          ...(recentGradedUnits != null ? { recentGradedUnits } : {}),
          ...scope.scope,
        },
      };
    }
    case "field_units": {
      const units = Number(condition.units);
      const freeText = (condition.freeText ?? "").trim();
      if (!Number.isFinite(units) || units <= 0)
        return { message: "Units must be greater than zero." };
      if (!freeText) return { message: "Enter the field as printed." };
      return { condition: { kind: "field_units", units, freeText } };
    }
    case "subject_sequence": {
      const subject = (condition.subjectCode ?? "").trim().toUpperCase();
      const code = (condition.courseCode ?? "").trim().toUpperCase();
      if (!SUBJECT_CODE_PATTERN.test(subject))
        return { message: "Subject must be a four-letter code." };
      if (!COURSE_CODE_PATTERN.test(code))
        return { message: "Choose the course the sequence is relative to." };
      return {
        condition: {
          kind: "subject_sequence",
          subjectCode: subject,
          courseCode: code,
        },
      };
    }
    case "wam": {
      if (condition.wam === null || condition.wam === undefined) {
        return { message: "WAM must be between 0 and 100." };
      }
      const wam = Number(condition.wam);
      if (!Number.isFinite(wam) || wam < 0 || wam > 100) {
        return { message: "WAM must be between 0 and 100." };
      }
      const recentGradedUnits = condition.recentGradedUnits;
      if (
        recentGradedUnits != null &&
        (!Number.isInteger(recentGradedUnits) ||
          recentGradedUnits < 1 ||
          recentGradedUnits > 300)
      )
        return { message: "Recent graded units must be between 1 and 300." };
      const scope = normaliseAverageScope(condition);
      if ("message" in scope) return scope;
      if (recentGradedUnits != null && Object.keys(scope.scope).length)
        return {
          message: "Choose either recent graded units or a course scope.",
        };
      return {
        condition: {
          kind: "wam",
          wam,
          ...(recentGradedUnits != null ? { recentGradedUnits } : {}),
          ...scope.scope,
        },
      };
    }
    case "permission": {
      const freeText = (condition.freeText ?? "").trim();
      if (!freeText) return { message: "Describe the permission required." };
      return { condition: { kind: "permission", freeText } };
    }
    case "other": {
      const freeText = (condition.freeText ?? "").trim();
      if (!freeText) return { message: "Describe the condition." };
      if (
        condition.noteKind != null &&
        requirementNoteKind(condition.noteKind) === null
      )
        return { message: "Choose how the note is shown." };
      return {
        condition: {
          kind: "other",
          freeText,
          ...(condition.noteKind ? { noteKind: condition.noteKind } : {}),
        },
      };
    }
    default:
      return { message: "Choose a condition type." };
  }
}

/** "Completed 5 LAWS courses at 1000 or 6100 level", with any concurrency. */
function filteredConditionSummary(condition: ReviewedConditionView) {
  const filter = {
    subjectCodes: condition.subjectCodes ?? null,
    courseLevels: condition.courseLevels ?? null,
  };
  const concurrent =
    condition.courseRequirementMode === "completed_or_concurrent"
      ? " (or currently enrolled)"
      : "";
  return condition.kind === "course_count"
    ? `Completed ${condition.courseCount} ${courseFilterLabel(filter, condition.courseCount === 1)}${concurrent}`
    : `Completed ${condition.units} units of ${courseFilterLabel(filter)}${concurrent}`;
}

function averageScopeText(condition: ReviewedConditionView) {
  if (condition.subjectCodes?.length)
    return ` in ${condition.subjectCodes.join(", ")} courses`;
  if (condition.courseCodes?.length)
    return ` across ${condition.courseCodes.join(", ")}`;
  if (condition.freeText) return ` in ${condition.freeText}`;
  return condition.recentGradedUnits
    ? ` over the most recent ${condition.recentGradedUnits} graded units`
    : " across the academic career";
}

export function conditionSourceText(condition: ReviewedConditionView) {
  switch (condition.kind) {
    case "course":
      return condition.mark != null
        ? `${condition.courseCode} with a mark of ${condition.mark}`
        : condition.courseRequirementMode === "completed_or_concurrent"
          ? `${condition.courseCode} completed or taken concurrently`
          : (condition.courseCode ?? "");
    case "incompatible_concurrent":
      return condition.courseCode
        ? `Must not concurrently enrol in ${condition.courseCode}`
        : "Choose a course";
    case "incompatible":
      return condition.courseCode
        ? `Must not have completed ${condition.courseCode}`
        : "";
    case "structure":
      return (
        (condition.structureName
          ? `${condition.structureName} (${condition.structureCode})`
          : condition.structureCode) ||
        (condition.freeText ?? "")
      );
    case "units_total":
      return `${condition.units} units of tertiary study`;
    case "subject_units":
      return `${condition.units} units of ${condition.subjectCode}`;
    case "subject_courses":
      return `${condition.courseCount} completed ${condition.subjectCode} ${condition.courseCount === 1 ? "course" : "courses"}`;
    case "level_units":
      return `${condition.units} units at ${condition.level}-level${
        condition.subjectCode ? ` in ${condition.subjectCode}` : ""
      }`;
    case "course_set_units":
      return `${condition.units} units from ${(condition.courseCodes ?? []).join(", ")}`;
    case "course_count":
    case "filtered_units":
      return filteredConditionSummary(condition);
    case "career":
      return careerConditionLabel(condition);
    case "college_enrolment":
      return `Enrolment in a programme offered by ${condition.freeText ?? "the required college"}`;
    case "enrolment_mode":
      return enrolmentModeConditionLabel(condition);
    case "commencement_year":
      return commencementYearLabel(condition);
    case "year_standing":
      return `At least year ${condition.minimumYear} standing`;
    case "gpa":
      return `GPA of at least ${condition.gpa}${averageScopeText(condition)}`;
    case "wam":
      return `WAM of at least ${condition.wam}${averageScopeText(condition)}`;
    case "field_units":
      return `${condition.units} units in ${condition.freeText ?? "the field"}`;
    case "subject_sequence":
      return `No later ${condition.subjectCode} course completed before ${condition.courseCode}`;
    case "permission":
    case "other":
      return condition.freeText ?? "";
    default:
      return "";
  }
}

export const CONDITION_KIND_LABELS: Record<ReviewedConditionKind, string> = {
  course: "Course",
  incompatible: "Course",
  incompatible_concurrent: "Course",
  structure: "Programme",
  units_total: "Units of study",
  subject_units: "Units in a subject",
  subject_courses: "Courses in a subject",
  course_count: "Courses by subject or level",
  filtered_units: "Units by subject or level",
  level_units: "Units at a level",
  course_set_units: "Units from courses",
  year_standing: "Year standing",
  commencement_year: "Commencement year",
  enrolment_mode: "Enrolment mode",
  college_enrolment: "Programme college",
  career: "Academic career",
  gpa: "Grade average",
  wam: "WAM",
  field_units: "Units in a field",
  subject_sequence: "Sequence order",
  permission: "Permission",
  other: "Other wording",
};

/** First dropdown: the subject of the condition, not the completed/mark sense. */
export const CONDITION_FAMILY_KINDS = [
  "course",
  "structure",
  "units_total",
  "subject_units",
  "subject_courses",
  "course_count",
  "filtered_units",
  "level_units",
  "course_set_units",
  "year_standing",
  "commencement_year",
  "enrolment_mode",
  "college_enrolment",
  "career",
  "gpa",
  "wam",
  "field_units",
  "subject_sequence",
  "permission",
  "other",
] as const;

export type ConditionFamilyKind = (typeof CONDITION_FAMILY_KINDS)[number];

export type CourseMatch =
  "completed" | "concurrent" | "not_completed" | "not_concurrent" | "mark";

export function conditionFamily(
  kind: ReviewedConditionKind,
): ConditionFamilyKind {
  return kind === "incompatible" || kind === "incompatible_concurrent"
    ? "course"
    : kind;
}

export function courseMatch(condition: ReviewedConditionView): CourseMatch {
  if (condition.kind === "incompatible") return "not_completed";
  if (condition.kind === "incompatible_concurrent") return "not_concurrent";
  if (condition.kind === "course" && condition.mark != null) return "mark";
  if (
    condition.kind === "course" &&
    condition.courseRequirementMode === "completed_or_concurrent"
  ) {
    return "concurrent";
  }
  return "completed";
}

export function applyCourseMatch(
  condition: ReviewedConditionNode,
  match: CourseMatch,
): ReviewedConditionNode {
  if (match === "not_completed" || match === "not_concurrent") {
    return {
      type: "condition",
      ...(condition.hardness === undefined
        ? {}
        : { hardness: condition.hardness }),
      id: condition.id,
      kind:
        match === "not_concurrent" ? "incompatible_concurrent" : "incompatible",
      courseCode: condition.courseCode,
      courseTitle: condition.courseTitle,
    };
  }
  return {
    type: "condition",
    ...(condition.hardness === undefined
      ? {}
      : { hardness: condition.hardness }),
    id: condition.id,
    kind: "course",
    courseCode: condition.courseCode,
    courseTitle: condition.courseTitle,
    mark: match === "mark" ? (condition.mark ?? 50) : null,
    courseRequirementMode:
      match === "concurrent" ? "completed_or_concurrent" : "completed",
  };
}

/** True once a condition carries every value the validator needs. */
export function isConditionComplete(condition: ReviewedConditionView) {
  switch (condition.kind) {
    case "course":
      return Boolean(condition.courseCode);
    case "incompatible":
    case "incompatible_concurrent":
      return Boolean(condition.courseCode);
    case "structure":
      return Boolean(condition.structureCode || condition.freeText?.trim());
    case "units_total":
      return condition.units != null;
    case "subject_units":
      return condition.units != null && Boolean(condition.subjectCode);
    case "subject_courses":
      return condition.courseCount != null && Boolean(condition.subjectCode);
    case "level_units":
      return condition.units != null && condition.level != null;
    case "course_set_units":
      return condition.units != null && Boolean(condition.courseCodes?.length);
    case "enrolment_mode":
      return (
        validEnrolmentMode(condition.enrolmentMode) &&
        typeof condition.matchesEnrolmentMode === "boolean"
      );
    case "commencement_year":
      return validCommencementYearBounds(condition);
    case "year_standing":
      return condition.minimumYear != null;
    case "gpa":
      return (
        condition.gpa != null &&
        (condition.recentGradedUnits == null ||
          (Number.isInteger(condition.recentGradedUnits) &&
            condition.recentGradedUnits >= 1 &&
            condition.recentGradedUnits <= 300))
      );
    case "wam":
      return (
        condition.wam != null &&
        (condition.recentGradedUnits == null ||
          (Number.isInteger(condition.recentGradedUnits) &&
            condition.recentGradedUnits >= 1 &&
            condition.recentGradedUnits <= 300))
      );
    case "field_units":
      return condition.units != null && Boolean(condition.freeText?.trim());
    case "subject_sequence":
      return Boolean(condition.subjectCode && condition.courseCode);
    case "permission":
    case "other":
      return Boolean(condition.freeText?.trim());
    case "college_enrolment":
      return Boolean(condition.freeText?.trim());
    case "course_count":
    case "filtered_units":
      return (
        (condition.kind === "course_count"
          ? condition.courseCount != null
          : condition.units != null) &&
        Boolean(
          condition.subjectCodes?.length || condition.courseLevels?.length,
        )
      );
    case "career":
      return (
        validProgrammeCareer(condition.career) &&
        typeof condition.matchesCareer === "boolean"
      );
    default:
      return false;
  }
}

/**
 * One line of plain wording for a condition, or the value still missing from
 * it, so a chip or a graph node never has to fall back to a bare type name.
 */
function conditionWording(condition: ReviewedConditionView) {
  switch (condition.kind) {
    case "course": {
      if (!condition.courseCode) return "Choose a course";
      if (condition.courseRequirementMode === "completed_or_concurrent") {
        return `Completed or concurrently enrolled in ${condition.courseCode}`;
      }
      return condition.mark != null
        ? `Completed ${condition.courseCode} with a mark of ${condition.mark}`
        : `Completed ${condition.courseCode}`;
    }
    case "incompatible_concurrent":
      return condition.courseCode
        ? `Must not concurrently enrol in ${condition.courseCode}`
        : "Choose a course";
    case "incompatible":
      return condition.courseCode
        ? `Must not have completed ${condition.courseCode}`
        : "Choose a course";
    case "structure": {
      const enrolled =
        condition.matchesStructure === false ? "Not enrolled" : "Enrolled";
      const code = condition.structureCode?.trim();
      if (code) return `${enrolled} in ${code}`;
      const freeText = condition.freeText?.trim();
      return freeText ? `${enrolled} in ${freeText}` : "Choose a programme";
    }
    case "units_total":
      return condition.units != null
        ? `Completed ${condition.units} units`
        : "Set the number of units";
    case "subject_units":
      return condition.units != null && condition.subjectCode
        ? `Completed ${condition.units} units of ${condition.subjectCode}`
        : "Set the units and subject";
    case "subject_courses":
      return condition.courseCount != null && condition.subjectCode
        ? `Completed ${condition.courseCount} ${condition.subjectCode} ${condition.courseCount === 1 ? "course" : "courses"}`
        : "Set the course count and subject";
    case "level_units":
      return condition.units != null && condition.level != null
        ? `Completed ${condition.units} units at ${condition.level} level${
            condition.subjectCode ? ` in ${condition.subjectCode}` : ""
          }`
        : "Set the units and level";
    case "course_set_units":
      return condition.units != null && condition.courseCodes?.length
        ? `Completed ${condition.units} units from ${condition.courseCodes.join(", ")}`
        : "Set the units and courses";
    case "course_count":
    case "filtered_units":
      return isConditionComplete(condition)
        ? filteredConditionSummary(condition)
        : "Set the amount and a subject or level";
    case "career":
      return careerConditionLabel(condition);
    case "college_enrolment":
      return condition.freeText?.trim()
        ? `Enrolled in a programme offered by ${condition.freeText}`
        : "Set the programme college";
    case "enrolment_mode":
      return enrolmentModeConditionLabel(condition);
    case "commencement_year":
      return commencementYearLabel(condition);
    case "year_standing":
      return condition.minimumYear != null
        ? `At least year ${condition.minimumYear} standing`
        : "Set the minimum year standing";
    case "gpa":
      return condition.gpa != null
        ? `Grade average of at least ${condition.gpa}${averageScopeText(condition)}`
        : "Set the grade average";
    case "wam":
      return condition.wam != null
        ? `WAM of at least ${condition.wam}${averageScopeText(condition)}`
        : "Set the minimum WAM";
    case "field_units":
      return isConditionComplete(condition)
        ? `Completed ${condition.units} units in ${condition.freeText}`
        : "Set the units and the field as printed";
    case "subject_sequence":
      return isConditionComplete(condition)
        ? `Not completed a later ${condition.subjectCode} course than ${condition.courseCode}`
        : "Set the subject and course";
    case "permission":
      return condition.freeText?.trim() || "Describe the permission needed";
    case "other":
      return condition.freeText?.trim() || "Describe the condition";
    default:
      return "Choose a condition type";
  }
}

/** The prefix an administrator sees on a labelled note. */
export const NOTE_KIND_SUMMARY_LABELS: Record<RequirementNoteKind, string> = {
  required: "Required note",
  recommended: "Recommended note",
  check_with_anu: "Check with ANU",
};

/** The summary, marked when the condition is soft and never blocks a student. */
export function conditionSummary(condition: ReviewedConditionView) {
  const summary = conditionWording(condition);
  if (condition.kind === "other" && condition.noteKind)
    return `${NOTE_KIND_SUMMARY_LABELS[condition.noteKind]}: ${summary}`;
  return condition.hardness === "advisory" ? `Soft: ${summary}` : summary;
}

/** Airtable-style sentence for a nested group. */
export function groupSentence(group: {
  minimumCount: number | null;
  operator: ReviewedOperator;
}) {
  if (group.operator === "all_of") return "All of the following are true";
  if (group.operator === "any_of") return "Any of the following are true";
  return `At least ${group.minimumCount ?? 1} of the following are true`;
}

/** How a group reads as the word sitting between two of its children. */
export function operatorJoiner(group: {
  minimumCount: number | null;
  operator: ReviewedOperator;
}) {
  if (group.operator === "all_of") return "AND";
  if (group.operator === "any_of") return "OR";
  return `at least ${group.minimumCount ?? 1}`;
}
