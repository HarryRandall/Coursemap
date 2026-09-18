import {
  parseRequisiteSummary,
  type RequisiteExpression,
} from "./requisite-summary.ts";

export const REVIEWED_OPERATORS = ["all_of", "any_of", "at_least"] as const;

export type ReviewedOperator = (typeof REVIEWED_OPERATORS)[number];

export const REVIEWED_CONDITION_KINDS = [
  "course",
  "incompatible",
  "structure",
  "units_total",
  "subject_units",
  "level_units",
  "course_set_units",
  "year_standing",
  "gpa",
  "wam",
  "permission",
  "other",
] as const;

export type ReviewedConditionKind = (typeof REVIEWED_CONDITION_KINDS)[number];

export const MAX_REVIEWED_GROUP_DEPTH = 5;

export type ReviewedConditionInput = {
  kind: ReviewedConditionKind;
  courseCode?: string | null;
  courseRequirementMode?: "completed" | "completed_or_concurrent" | null;
  structureCode?: string | null;
  units?: number | null;
  courseCodes?: string[] | null;
  subjectCode?: string | null;
  level?: number | null;
  minimumYear?: number | null;
  gpa?: number | null;
  wam?: number | null;
  mark?: number | null;
  freeText?: string | null;
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
  subjectCode: string | null;
  level: number | null;
  gpa: number | null;
  minimumYear?: number | null;
  wam?: number | null;
  courseCodes?: string[] | null;
  mark: number | null;
  freeText: string | null;
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

/** Add a condition and set whether it joins with and or or. */
export function addJoinedCondition(
  tree: ReviewedGroupNode,
  groupId: string,
  operator: Extract<ReviewedOperator, "all_of" | "any_of">,
): ReviewedGroupNode {
  return addChild(
    setGroupOperator(tree, groupId, operator),
    groupId,
    createConditionNode("course"),
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
      return condition.courseCode
        ? {
            kind: "incompatible",
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
    case "year_standing":
      return condition.minimumYear != null
        ? { kind: "year_standing", minimumYear: condition.minimumYear }
        : null;
    case "gpa":
      return condition.gpa != null ? { kind: "gpa", gpa: condition.gpa } : null;
    case "wam":
      return condition.wam != null ? { kind: "wam", wam: condition.wam } : null;
    case "permission":
      return condition.freeText
        ? { kind: "permission", freeText: condition.freeText }
        : null;
    case "other":
      return condition.freeText
        ? { kind: "other", freeText: condition.freeText }
        : null;
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
    children.push({
      ...normalised.condition,
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
    case "incompatible": {
      const code = (condition.courseCode ?? "").trim().toUpperCase();
      if (!COURSE_CODE_PATTERN.test(code)) {
        return { message: "Choose a course code." };
      }
      return { condition: { kind: "incompatible", courseCode: code } };
    }
    case "structure": {
      const code = (condition.structureCode ?? "").trim().toUpperCase();
      const freeText = (condition.freeText ?? "").trim() || null;
      if (code) {
        if (!STRUCTURE_CODE_PATTERN.test(code)) {
          return { message: "Choose a programme code." };
        }
        return { condition: { kind: "structure", structureCode: code } };
      }
      if (freeText) return { condition: { kind: "structure", freeText } };
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
      return { condition: { kind: "gpa", gpa } };
    }
    case "wam": {
      if (condition.wam === null || condition.wam === undefined) {
        return { message: "WAM must be between 0 and 100." };
      }
      const wam = Number(condition.wam);
      if (!Number.isFinite(wam) || wam < 0 || wam > 100) {
        return { message: "WAM must be between 0 and 100." };
      }
      return { condition: { kind: "wam", wam } };
    }
    case "permission": {
      const freeText = (condition.freeText ?? "").trim();
      if (!freeText) return { message: "Describe the permission required." };
      return { condition: { kind: "permission", freeText } };
    }
    case "other": {
      const freeText = (condition.freeText ?? "").trim();
      if (!freeText) return { message: "Describe the condition." };
      return { condition: { kind: "other", freeText } };
    }
    default:
      return { message: "Choose a condition type." };
  }
}

export function automaticExpressionFromSource(sourceText: string) {
  return parseRequisiteSummary(sourceText);
}

function expressionToNode(expression: RequisiteExpression): ReviewedRuleNode {
  const id = newNodeId();
  switch (expression.kind) {
    case "group":
      return {
        type: "group",
        id,
        operator: expression.operator,
        minimumCount: null,
        children: expression.conditions.map(expressionToNode),
      };
    case "course":
      return {
        type: "condition",
        id,
        kind: "course",
        courseCode: expression.code,
        mark: null,
      };
    case "subject_units":
      return {
        type: "condition",
        id,
        kind: "subject_units",
        units: expression.units,
        subjectCode: expression.subject,
      };
    case "level_units":
      return {
        type: "condition",
        id,
        kind: "level_units",
        units: expression.units,
        level: expression.level,
        subjectCode: expression.subject ?? null,
      };
    case "units_total":
      return {
        type: "condition",
        id,
        kind: "units_total",
        units: expression.units,
      };
    case "programme_enrolment":
      return {
        type: "condition",
        id,
        kind: "structure",
        structureCode: expression.code,
        structureName: expression.name,
      };
  }
}

/** The importer's reading of the wording as one line of plain text. */
export function expressionSummary(expression: RequisiteExpression): string {
  switch (expression.kind) {
    case "course":
      return expression.code;
    case "subject_units":
      return `${expression.units} units of ${expression.subject}`;
    case "level_units":
      return `${expression.units} units at ${expression.level} level${
        expression.subject ? ` in ${expression.subject}` : ""
      }`;
    case "units_total":
      return `${expression.units} units of study`;
    case "programme_enrolment":
      return `enrolled in ${expression.name} (${expression.code})`;
    case "group": {
      const joiner = expression.operator === "all_of" ? " and " : " or ";
      return expression.conditions
        .map((condition) =>
          condition.kind === "group"
            ? `(${expressionSummary(condition)})`
            : expressionSummary(condition),
        )
        .join(joiner);
    }
  }
}

/** Turn the importer's reading of the wording into an editable tree. */
export function reviewedTreeFromExpression(
  expression: RequisiteExpression,
): ReviewedRuleTree {
  const node = expressionToNode(expression);
  if (node.type === "group") return node;
  return {
    type: "group",
    id: newNodeId(),
    operator: "all_of",
    minimumCount: null,
    children: [node],
  };
}

export function conditionSourceText(condition: ReviewedConditionView) {
  switch (condition.kind) {
    case "course":
      return condition.mark != null
        ? `${condition.courseCode} with a mark of ${condition.mark}`
        : condition.courseRequirementMode === "completed_or_concurrent"
          ? `${condition.courseCode} completed or taken concurrently`
          : (condition.courseCode ?? "");
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
    case "level_units":
      return `${condition.units} units at ${condition.level}-level${
        condition.subjectCode ? ` in ${condition.subjectCode}` : ""
      }`;
    case "course_set_units":
      return `${condition.units} units from ${(condition.courseCodes ?? []).join(", ")}`;
    case "year_standing":
      return `At least year ${condition.minimumYear} standing`;
    case "gpa":
      return `GPA of at least ${condition.gpa}`;
    case "wam":
      return `WAM of at least ${condition.wam}`;
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
  structure: "Programme",
  units_total: "Units of study",
  subject_units: "Units in a subject",
  level_units: "Units at a level",
  course_set_units: "Units from courses",
  year_standing: "Year standing",
  gpa: "Grade average",
  wam: "WAM",
  permission: "Permission",
  other: "Other wording",
};

/** First dropdown: the subject of the condition, not the completed/mark sense. */
export const CONDITION_FAMILY_KINDS = [
  "course",
  "structure",
  "units_total",
  "subject_units",
  "level_units",
  "course_set_units",
  "year_standing",
  "gpa",
  "wam",
  "permission",
  "other",
] as const;

export type ConditionFamilyKind = (typeof CONDITION_FAMILY_KINDS)[number];

export type CourseMatch = "completed" | "concurrent" | "not_completed" | "mark";

export function conditionFamily(
  kind: ReviewedConditionKind,
): ConditionFamilyKind {
  return kind === "incompatible" ? "course" : kind;
}

export function courseMatch(condition: ReviewedConditionView): CourseMatch {
  if (condition.kind === "incompatible") return "not_completed";
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
  if (match === "not_completed") {
    return {
      type: "condition",
      id: condition.id,
      kind: "incompatible",
      courseCode: condition.courseCode,
      courseTitle: condition.courseTitle,
    };
  }
  return {
    type: "condition",
    id: condition.id,
    kind: "course",
    courseCode: condition.courseCode,
    courseTitle: condition.courseTitle,
    mark: match === "mark" ? (condition.mark ?? 50) : null,
    courseRequirementMode:
      match === "concurrent" ? "completed_or_concurrent" : "completed",
  };
}

export function conditionKindLabel(kind: ReviewedConditionKind) {
  return CONDITION_KIND_LABELS[kind] ?? "Condition";
}

/** True once a condition carries every value the validator needs. */
export function isConditionComplete(condition: ReviewedConditionView) {
  switch (condition.kind) {
    case "course":
      return Boolean(condition.courseCode);
    case "incompatible":
      return Boolean(condition.courseCode);
    case "structure":
      return Boolean(condition.structureCode || condition.freeText?.trim());
    case "units_total":
      return condition.units != null;
    case "subject_units":
      return condition.units != null && Boolean(condition.subjectCode);
    case "level_units":
      return condition.units != null && condition.level != null;
    case "course_set_units":
      return condition.units != null && Boolean(condition.courseCodes?.length);
    case "year_standing":
      return condition.minimumYear != null;
    case "gpa":
      return condition.gpa != null;
    case "wam":
      return condition.wam != null;
    case "permission":
    case "other":
      return Boolean(condition.freeText?.trim());
    default:
      return false;
  }
}

/**
 * One line of plain wording for a condition, or the value still missing from
 * it, so a chip or a graph node never has to fall back to a bare type name.
 */
export function conditionSummary(condition: ReviewedConditionView) {
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
    case "incompatible":
      return condition.courseCode
        ? `Must not have completed ${condition.courseCode}`
        : "Choose a course";
    case "structure": {
      const code = condition.structureCode?.trim();
      if (code) return `Enrolled in ${code}`;
      const freeText = condition.freeText?.trim();
      return freeText ? `Enrolled in ${freeText}` : "Choose a programme";
    }
    case "units_total":
      return condition.units != null
        ? `Completed ${condition.units} units`
        : "Set the number of units";
    case "subject_units":
      return condition.units != null && condition.subjectCode
        ? `Completed ${condition.units} units of ${condition.subjectCode}`
        : "Set the units and subject";
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
    case "year_standing":
      return condition.minimumYear != null
        ? `At least year ${condition.minimumYear} standing`
        : "Set the minimum year standing";
    case "gpa":
      return condition.gpa != null
        ? `Grade average of at least ${condition.gpa}`
        : "Set the grade average";
    case "wam":
      return condition.wam != null
        ? `WAM of at least ${condition.wam}`
        : "Set the minimum WAM";
    case "permission":
      return condition.freeText?.trim() || "Describe the permission needed";
    case "other":
      return condition.freeText?.trim() || "Describe the condition";
    default:
      return "Choose a condition type";
  }
}

/** How a group reads as a heading above its own children. */
export function groupTitle(group: {
  minimumCount: number | null;
  operator: ReviewedOperator;
}) {
  if (group.operator === "all_of") return "AND";
  if (group.operator === "any_of") return "OR";
  return `At least ${group.minimumCount ?? 1}`;
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

/** How a group reads as a single line inside its parent. */
export function groupSummary(group: ReviewedGroupNode) {
  const count = group.children.length;
  if (count === 0) return "Nothing to match yet";
  const items = count === 1 ? "1 condition" : `${count} conditions`;
  if (group.operator === "all_of") return `${items}, all must match`;
  if (group.operator === "any_of") return `${items}, any may match`;
  return `${items}, ${group.minimumCount ?? 1} must match`;
}

export function preservedRuleField(ruleKind: string) {
  return `course.requisites.${ruleKind}`;
}
