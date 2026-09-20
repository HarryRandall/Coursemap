import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
  RequirementTreeNode,
} from "@/lib/coursemap/requirement-tree-node";

/**
 * The stored requirement shape, as both the import write and the published
 * read produce it. Structural rather than imported so one adapter serves the
 * administrator preview and the published structure page without either side
 * converting first.
 */
export type RequirementTreeSource = {
  groups: ReadonlyArray<{
    key: string;
    ruleKey?: string | null;
    parentKey: string | null;
    label: string | null;
    description: string | null;
    operator: string;
    minimumCount: number | null;
    minimumUnits: number | null;
    maximumUnits: number | null;
    sourceText?: string | null;
    sourceLocator?: string | null;
    position: number;
  }>;
  conditions: ReadonlyArray<{
    key: string;
    groupKey: string;
    position: number;
    kind: string;
    itemCode?: string | null;
    structureKind?: string | null;
    requirementMode?: "completed" | "completed_or_concurrent" | null;
    minimumMark?: number | null;
    minimumUnits: number | null;
    maximumUnits: number | null;
    minimumCount: number | null;
    subjectCode: string | null;
    minimumLevel: number | null;
    maximumLevel: number | null;
    minimumYear?: number | null;
    minimumGpa?: number | null;
    minimumWam?: number | null;
    tag: string | null;
    freeText: string | null;
    sourceText?: string | null;
    sourceLocator?: string | null;
  }>;
  options: ReadonlyArray<{
    conditionKey: string;
    position: number;
    kind: string;
    code: string;
    title?: string | null;
  }>;
};

/**
 * Builds the display tree for one rule. Node identifiers are positional
 * because a write has no database identifiers yet, and the display kit only
 * needs them to key a node within the tree it is rendering.
 */
export function requirementTreeFromSource(
  source: RequirementTreeSource,
  ruleKey?: string,
): RequirementTreeGroup | null {
  const groups = source.groups.filter(
    (group) => ruleKey === undefined || (group.ruleKey ?? ruleKey) === ruleKey,
  );
  const root = groups.find((group) => group.parentKey === null);
  if (!root) return null;

  type SourceGroup = RequirementTreeSource["groups"][number];
  type SourceCondition = RequirementTreeSource["conditions"][number];
  type SourceOption = RequirementTreeSource["options"][number];

  const groupKeys = new Set(groups.map((group) => group.key));
  const childGroupsByParent = new Map<string, SourceGroup[]>();
  for (const group of groups) {
    // A parent outside this rule would orphan the group, so treat it as a root
    // sibling rather than dropping it silently.
    if (group.parentKey === null || !groupKeys.has(group.parentKey)) continue;
    const siblings = childGroupsByParent.get(group.parentKey) ?? [];
    siblings.push(group);
    childGroupsByParent.set(group.parentKey, siblings);
  }
  const conditionsByGroup = new Map<string, SourceCondition[]>();
  for (const condition of source.conditions) {
    if (!groupKeys.has(condition.groupKey)) continue;
    const siblings = conditionsByGroup.get(condition.groupKey) ?? [];
    siblings.push(condition);
    conditionsByGroup.set(condition.groupKey, siblings);
  }
  const optionsByCondition = new Map<string, SourceOption[]>();
  for (const option of source.options) {
    const siblings = optionsByCondition.get(option.conditionKey) ?? [];
    siblings.push(option);
    optionsByCondition.set(option.conditionKey, siblings);
  }

  let nextId = 0;
  function conditionNode(condition: SourceCondition): RequirementTreeCondition {
    return {
      type: "condition",
      conditionKind: condition.kind,
      freeText: condition.freeText,
      id: (nextId += 1),
      itemCode: condition.itemCode ?? null,
      maximumLevel: condition.maximumLevel,
      maximumUnits: condition.maximumUnits,
      minimumCourses: condition.minimumCount,
      minimumGpa: condition.minimumGpa ?? null,
      minimumLevel: condition.minimumLevel,
      minimumMark: condition.minimumMark ?? null,
      minimumUnits: condition.minimumUnits,
      minimumWam: condition.minimumWam ?? null,
      minimumYear: condition.minimumYear ?? null,
      options: (optionsByCondition.get(condition.key) ?? [])
        .toSorted((left, right) => left.position - right.position)
        .map((option) => ({
          code: option.code,
          kind: option.kind === "course" ? "course" : "structure",
          position: option.position,
          structureKind: option.kind === "course" ? null : option.kind,
          title: option.title ?? null,
        })),
      position: condition.position,
      projectionKey: condition.key,
      requirementMode: condition.requirementMode ?? null,
      sourceLocator: condition.sourceLocator ?? "",
      sourceText: condition.sourceText ?? "",
      structureKind: condition.structureKind ?? null,
      subjectCode: condition.subjectCode,
      tag: condition.tag,
    };
  }

  function groupNode(
    group: SourceGroup,
    ancestors: ReadonlySet<string>,
  ): RequirementTreeGroup {
    const nextAncestors = new Set(ancestors).add(group.key);
    const children: RequirementTreeNode[] = [
      ...(childGroupsByParent.get(group.key) ?? [])
        .filter((child) => !nextAncestors.has(child.key))
        .map((child) => groupNode(child, nextAncestors)),
      ...(conditionsByGroup.get(group.key) ?? []).map(conditionNode),
    ];
    return {
      type: "group",
      children: children.toSorted(
        (left, right) => left.position - right.position,
      ),
      description: group.description,
      groupKey: group.key,
      id: (nextId += 1),
      maximumUnits: group.maximumUnits,
      minimumCount: group.minimumCount,
      minimumUnits: group.minimumUnits,
      operator: group.operator,
      position: group.position,
      sourceLocator: group.sourceLocator ?? "",
      sourceText: group.sourceText ?? "",
      title: group.label,
    };
  }

  return groupNode(root, new Set());
}
