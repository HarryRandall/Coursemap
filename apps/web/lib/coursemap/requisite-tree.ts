import type {
  CoursePrerequisiteEdge,
  CourseRuleExpression,
} from "@/lib/coursemap/course-types";
import type {
  RequirementTreeCondition,
  RequirementTreeOption,
} from "@/lib/coursemap/requirement-tree-node";

export type CourseRuleCondition = Exclude<
  CourseRuleExpression,
  { kind: "group" }
>;

/**
 * One course rule condition in the shared requirement shape, so a requisite
 * reads through the same vocabulary as a programme requirement instead of
 * falling back to the ANU prose for every kind the narrow summary never
 * covered.
 */
export function requisiteConditionNode(
  condition: CourseRuleCondition,
  position = 0,
): RequirementTreeCondition {
  const options: RequirementTreeOption[] =
    condition.kind === "course_set_units"
      ? condition.courseCodes.map((code, index) => ({
          code,
          kind: "course",
          position: index,
          structureKind: null,
        }))
      : condition.kind === "structure_set"
        ? condition.structureCodes.map((code, index) => ({
            code,
            kind: "structure",
            position: index,
            structureKind: condition.structureKind,
          }))
        : [];
  return {
    type: "condition",
    conditionKind: condition.kind,
    freeText:
      condition.kind === "permission" ||
      condition.kind === "other" ||
      condition.kind === "structure"
        ? condition.text
        : null,
    id: position,
    itemCode:
      condition.kind === "course" || condition.kind === "incompatible"
        ? condition.code
        : condition.kind === "structure"
          ? condition.structureCode
          : null,
    maximumLevel:
      condition.kind === "level_units" ? condition.maximumLevel : null,
    maximumUnits: null,
    minimumCourses:
      condition.kind === "structure_set" ? condition.minimumCount : null,
    minimumGpa: condition.kind === "gpa" ? condition.minimumGpa : null,
    minimumLevel:
      condition.kind === "level_units" ? condition.minimumLevel : null,
    minimumMark: condition.kind === "course" ? condition.minimumMark : null,
    minimumUnits:
      condition.kind === "units_total" ||
      condition.kind === "subject_units" ||
      condition.kind === "level_units" ||
      condition.kind === "course_set_units" ||
      condition.kind === "tagged_units" ||
      condition.kind === "elective_units"
        ? condition.units
        : null,
    minimumWam: condition.kind === "wam" ? condition.minimumWam : null,
    minimumYear:
      condition.kind === "year_standing" ? condition.minimumYear : null,
    options,
    position,
    projectionKey: `${condition.kind}-${position}`,
    requirementMode:
      condition.kind === "course" ? condition.requirementMode : null,
    sourceLocator: "",
    sourceText: condition.sourceText,
    structureKind:
      condition.kind === "structure_set" ? condition.structureKind : null,
    subjectCode:
      condition.kind === "units_total" ||
      condition.kind === "subject_units" ||
      condition.kind === "level_units"
        ? condition.subject
        : null,
    tag: condition.kind === "tagged_units" ? condition.tag : null,
  };
}

/**
 * A prerequisite rule drawn as a layered graph. Nodes carry the condition they
 * came from rather than finished wording, so the display kit in
 * `ui/requirements/requirement-presentation.ts` keeps ownership of how every
 * condition kind reads and the graph cannot grow a second vocabulary.
 */
export type RequisiteGraphNode =
  | { id: string; depth: number; kind: "current"; code: string }
  | {
      id: string;
      depth: number;
      kind: "course";
      code: string;
      isAvailable: boolean;
      condition: CourseRuleCondition | null;
    }
  | {
      id: string;
      depth: number;
      kind: "requirement";
      condition: CourseRuleCondition;
    }
  | {
      id: string;
      depth: number;
      kind: "choice";
      minimumCount: number | null;
      operator: "all_of" | "any_of" | "at_least";
    }
  | {
      id: string;
      depth: number;
      kind: "unlocked";
      code: string;
      isAvailable: boolean;
    };

export type RequisiteGraphEdge = {
  from: string;
  to: string;
  /** Leaves an alternative group, so this is one of several ways to qualify. */
  alternative: boolean;
};

export type RequisiteGraph = {
  edges: RequisiteGraphEdge[];
  /**
   * Courses the prerequisite rule excludes. Collected so the caller can say so
   * separately; an incompatibility is never drawn as something to complete.
   */
  incompatibleCodes: string[];
  /** Furthest prerequisite column, counting left from the course itself. */
  maximumDepth: number;
  nodes: RequisiteGraphNode[];
  /**
   * Where the upstream side came from: the reviewed rule tree, the flat course
   * codes detected in the prerequisite prose, or nothing at all.
   */
  source: "none" | "references" | "rule";
};

const GRAPH_COURSE_CODE = /^[A-Z]{4}\d{4}[A-Z]?$/u;

function collectIncompatibleCodes(
  expression: CourseRuleExpression,
  codes: Set<string>,
) {
  if (expression.kind === "group") {
    for (const child of expression.conditions) {
      collectIncompatibleCodes(child, codes);
    }
    return;
  }
  if (expression.kind === "incompatible") codes.add(expression.code);
}

/** Whether anything survives once incompatibilities are taken out. */
function hasRequirementContent(expression: CourseRuleExpression): boolean {
  if (expression.kind === "incompatible") return false;
  if (expression.kind !== "group") return true;
  return expression.conditions.some(hasRequirementContent);
}

/**
 * An `all_of` earns a node inside an alternative, where flattening would make
 * "one of X, or both Y and Z" read as three equal choices, and at the root.
 *
 * The root used to be flattened too, on the reasoning that every edge into the
 * course already means "and". Readers do not see it that way: several arrows
 * converging on one course read as several ways in, and once one of those
 * arrows leaves a "Choose one" node the rest are read as further choices. For
 * COMP3600 that turned "24 units of COMP, and one of MATH or COMP1600" into
 * three alternatives. An explicit node says the requirements are all needed.
 * A group with a single child is noise either way.
 */
function groupNeedsNode(
  expression: Extract<CourseRuleExpression, { kind: "group" }>,
  childCount: number,
  insideAlternative: boolean,
  isRoot: boolean,
) {
  if (childCount < 2) return false;
  if (expression.operator === "all_of") return insideAlternative || isRoot;
  return true;
}

export function buildRequisiteGraph({
  availableCourseCodes,
  code,
  expression,
  prerequisiteEdges,
}: {
  availableCourseCodes: ReadonlySet<string>;
  code: string;
  expression: CourseRuleExpression | null;
  prerequisiteEdges: readonly CoursePrerequisiteEdge[];
}): RequisiteGraph {
  const nodes: RequisiteGraphNode[] = [];
  const edges: RequisiteGraphEdge[] = [];
  const incompatible = new Set<string>();
  const currentId = "course";
  nodes.push({ id: currentId, depth: 0, kind: "current", code });

  const courseNodeByCode = new Map<string, string>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

  const addCourseNode = (
    courseCode: string,
    depth: number,
    condition: CourseRuleCondition | null,
  ) => {
    const existing = courseNodeByCode.get(courseCode);
    if (existing) return existing;
    const id = nextId("course");
    courseNodeByCode.set(courseCode, id);
    nodes.push({
      id,
      depth,
      kind: "course",
      code: courseCode,
      isAvailable: availableCourseCodes.has(courseCode),
      condition,
    });
    return id;
  };

  let source: RequisiteGraph["source"] = "none";

  if (expression) {
    collectIncompatibleCodes(expression, incompatible);
    const attach = (
      child: CourseRuleExpression,
      parentId: string,
      depth: number,
      alternative: boolean,
    ) => {
      if (!hasRequirementContent(child)) return;
      if (child.kind === "group") {
        const children = child.conditions.filter(hasRequirementContent);
        if (
          !groupNeedsNode(
            child,
            children.length,
            alternative,
            parentId === currentId,
          )
        ) {
          // Flattened, so each child inherits the meaning of the edge above it.
          for (const grandchild of children) {
            attach(grandchild, parentId, depth, alternative);
          }
          return;
        }
        const id = nextId("choice");
        nodes.push({
          id,
          depth,
          kind: "choice",
          minimumCount: child.minimumCount,
          operator: child.operator,
        });
        edges.push({ from: id, to: parentId, alternative });
        for (const grandchild of children) {
          attach(grandchild, id, depth + 1, child.operator !== "all_of");
        }
        return;
      }
      if (child.kind === "course" && GRAPH_COURSE_CODE.test(child.code)) {
        const id = addCourseNode(child.code, depth, child);
        edges.push({ from: id, to: parentId, alternative });
        return;
      }
      const id = nextId("requirement");
      nodes.push({ id, depth, kind: "requirement", condition: child });
      edges.push({ from: id, to: parentId, alternative });
    };
    attach(expression, currentId, 1, false);
    if (nodes.length > 1) source = "rule";
  }

  if (source === "none") {
    // No reviewed tree: fall back to the course codes detected upstream, which
    // carry no operator and are labelled as detected rather than as the rule.
    for (const edge of prerequisiteEdges) {
      if (edge.to !== code || edge.from === code) continue;
      const id = addCourseNode(edge.from, 1, null);
      edges.push({ from: id, to: currentId, alternative: false });
      source = "references";
    }
  }

  // Chain further upstream from every course the rule names, so a prerequisite
  // of a prerequisite stays visible. Those courses carry no operator here; the
  // AND and OR shape of their own rules belongs on their own pages.
  const incoming = new Map<string, CoursePrerequisiteEdge[]>();
  for (const edge of prerequisiteEdges) {
    if (edge.from === edge.to) continue;
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }
  const depthByNode = new Map(nodes.map((node) => [node.id, node.depth]));
  const visitUpstream = (courseCode: string, path: ReadonlySet<string>) => {
    const targetId = courseNodeByCode.get(courseCode);
    if (!targetId) return;
    const targetDepth = depthByNode.get(targetId) ?? 1;
    for (const edge of incoming.get(courseCode) ?? []) {
      if (path.has(edge.from)) continue;
      const existingId = courseNodeByCode.get(edge.from);
      const id = existingId ?? addCourseNode(edge.from, targetDepth + 1, null);
      const nextDepth = Math.max(
        depthByNode.get(id) ?? targetDepth + 1,
        targetDepth + 1,
      );
      depthByNode.set(id, nextDepth);
      const node = nodes.find((candidate) => candidate.id === id);
      if (node) node.depth = nextDepth;
      if (!edges.some((item) => item.from === id && item.to === targetId)) {
        edges.push({ from: id, to: targetId, alternative: false });
      }
      visitUpstream(edge.from, new Set([...path, edge.from]));
    }
  };
  for (const courseCode of [...courseNodeByCode.keys()]) {
    visitUpstream(courseCode, new Set([code, courseCode]));
  }

  for (const edge of prerequisiteEdges) {
    if (edge.from !== code || edge.to === code) continue;
    if (nodes.some((node) => node.kind === "unlocked" && node.code === edge.to))
      continue;
    const id = nextId("unlocked");
    nodes.push({
      id,
      depth: -1,
      kind: "unlocked",
      code: edge.to,
      isAvailable: edge.toIsAvailable || availableCourseCodes.has(edge.to),
    });
    edges.push({ from: currentId, to: id, alternative: false });
  }

  return {
    edges,
    incompatibleCodes: [...incompatible].sort(),
    // Always keep one prerequisite column so its empty state has somewhere to sit.
    maximumDepth: Math.max(1, ...nodes.map((node) => node.depth)),
    nodes,
    source,
  };
}
