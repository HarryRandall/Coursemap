import type {
  ReviewedConditionNode,
  ReviewedGroupNode,
  ReviewedRuleTree,
} from "../coursemap/requisite-conditions.ts";
import type {
  CatalogueKind,
  RequirementRuleKind,
  RequirementWrite,
} from "../catalogue/content.ts";

/** Condition kinds the drag-and-drop editor can represent. */
const EDITABLE_KINDS = new Set([
  "course",
  "incompatible",
  "incompatible_concurrent",
  "structure",
  "units_total",
  "subject_units",
  "subject_courses",
  "level_units",
  "course_set_units",
  "year_standing",
  "commencement_year",
  "gpa",
  "wam",
  "permission",
  "other",
]);

export function ruleIsEditableAsTree(
  requirements: RequirementWrite,
  ruleKey: RequirementRuleKind,
) {
  return requirements.conditions
    .filter((condition) => condition.ruleKey === ruleKey)
    .every((condition) => EDITABLE_KINDS.has(condition.kind));
}

/** A rule's groups and conditions as the editor's nested tree. */
export function treeFromRequirementWrite(
  requirements: RequirementWrite,
  ruleKey: RequirementRuleKind,
): ReviewedRuleTree | null {
  const groups = requirements.groups.filter(
    (group) => group.ruleKey === ruleKey,
  );
  const root = groups.find((group) => group.parentKey === null);
  if (!root) return null;
  const optionsFor = (conditionKey: string) =>
    requirements.options
      .filter(
        (option) =>
          option.conditionKey === conditionKey && option.kind === "course",
      )
      .sort((left, right) => left.position - right.position)
      .map((option) => option.code);

  const build = (groupKey: string): ReviewedGroupNode => {
    const group = groups.find((candidate) => candidate.key === groupKey)!;
    const childGroups = groups
      .filter((candidate) => candidate.parentKey === groupKey)
      .map((candidate) => ({
        position: candidate.position,
        node: build(candidate.key),
      }));
    const leaves = requirements.conditions
      .filter(
        (condition) =>
          condition.ruleKey === ruleKey && condition.groupKey === groupKey,
      )
      .map((condition) => ({
        position: condition.position,
        node: {
          type: "condition" as const,
          id: `condition-${condition.key}`,
          kind: (EDITABLE_KINDS.has(condition.kind)
            ? condition.kind
            : "other") as ReviewedConditionNode["kind"],
          courseCode:
            condition.kind === "course" ||
            condition.kind === "incompatible" ||
            condition.kind === "incompatible_concurrent"
              ? condition.itemCode
              : null,
          courseRequirementMode: condition.requirementMode,
          hardness: condition.hardness,
          structureCode:
            condition.kind === "structure" ? condition.itemCode : null,
          units: condition.minimumUnits,
          courseCount: condition.minimumCount,
          courseCodes:
            condition.kind === "course_set_units"
              ? optionsFor(condition.key)
              : null,
          subjectCode: condition.subjectCode,
          level: condition.minimumLevel,
          minimumYear: condition.minimumYear,
          ...(condition.kind === "commencement_year"
            ? {
                minimumCommencementYear:
                  condition.minimumCommencementYear ?? null,
                maximumCommencementYear:
                  condition.maximumCommencementYear ?? null,
              }
            : {}),
          gpa: condition.minimumGpa,
          wam: condition.minimumWam,
          mark: condition.minimumMark,
          freeText: EDITABLE_KINDS.has(condition.kind)
            ? condition.freeText
            : (condition.freeText ?? condition.sourceText ?? condition.kind),
        },
      }));
    const children = [...childGroups, ...leaves]
      .sort((left, right) => left.position - right.position)
      .map((item) => item.node);
    return {
      type: "group",
      id: `group-${group.key}`,
      operator: group.operator,
      minimumCount:
        group.operator === "at_least"
          ? (group.minimumCount ?? Math.max(1, children.length))
          : null,
      children,
    };
  };
  return build(root.key);
}

/**
 * Replaces one rule in the requirements with the editor's tree. Manual edits
 * are marked verified with full confidence; the rule's source text is kept.
 */
export function requirementWriteWithTree(
  requirements: RequirementWrite,
  ruleKey: RequirementRuleKind,
  tree: ReviewedRuleTree | null,
  sourceText: string,
): RequirementWrite {
  const keep = (key: RequirementRuleKind) => key !== ruleKey;
  const keptConditions = requirements.conditions.filter((condition) =>
    keep(condition.ruleKey),
  );
  const keptKeys = new Set(keptConditions.map((condition) => condition.key));
  const next: RequirementWrite = {
    rules: requirements.rules.filter((rule) => keep(rule.key)),
    groups: requirements.groups.filter((group) => keep(group.ruleKey)),
    conditions: keptConditions,
    options: requirements.options.filter((option) =>
      keptKeys.has(option.conditionKey),
    ),
    references: requirements.references.filter((reference) =>
      keep(reference.ruleKey),
    ),
  };
  if (!tree || tree.children.length === 0) return next;

  const existing = requirements.rules.find((rule) => rule.key === ruleKey);
  next.rules.push({
    key: ruleKey,
    hardness: existing?.hardness ?? "hard",
    sourceText:
      sourceText.trim() ||
      existing?.sourceText ||
      `${ruleKey} set by an administrator`,
    sourceLocator: null,
    reviewState: "verified",
    confidence: 1,
    position: existing?.position ?? next.rules.length,
  });
  let counter = 0;
  const visit = (
    group: ReviewedGroupNode,
    parentKey: string | null,
    position: number,
  ) => {
    const groupKey = `${ruleKey}:group:${counter++}`;
    next.groups.push({
      key: groupKey,
      ruleKey,
      parentKey,
      label: null,
      description: null,
      operator: group.operator,
      minimumCount:
        group.operator === "at_least" ? (group.minimumCount ?? 1) : null,
      minimumUnits: null,
      maximumUnits: null,
      sourceText: null,
      sourceLocator: null,
      position,
    });
    group.children.forEach((child, index) => {
      if (child.type === "group") {
        visit(child, groupKey, index);
        return;
      }
      const conditionKey = `${ruleKey}:condition:${counter++}`;
      const previous = requirements.conditions.find(
        (condition) => child.id === `condition-${condition.key}`,
      );
      const itemKind: CatalogueKind | null =
        child.kind === "course" ||
        child.kind === "incompatible" ||
        child.kind === "incompatible_concurrent"
          ? "course"
          : child.kind === "structure" && child.structureCode
            ? "programme"
            : null;
      next.conditions.push({
        key: conditionKey,
        ruleKey,
        groupKey,
        position: index,
        kind: child.kind,
        itemCode:
          itemKind === "course"
            ? (child.courseCode ?? null)
            : (child.structureCode ?? null),
        itemKind,
        structureKind: null,
        requirementMode:
          child.kind === "course"
            ? (child.courseRequirementMode ?? "completed")
            : null,
        minimumMark: child.mark ?? null,
        minimumUnits:
          child.kind === "subject_courses" ? null : (child.units ?? null),
        maximumUnits: null,
        minimumCount:
          child.kind === "subject_courses" ? (child.courseCount ?? null) : null,
        subjectCode: child.subjectCode ?? null,
        minimumLevel: child.level ?? null,
        maximumLevel: null,
        minimumYear: child.minimumYear ?? null,
        ...(child.kind === "commencement_year"
          ? {
              minimumCommencementYear: child.minimumCommencementYear ?? null,
              maximumCommencementYear: child.maximumCommencementYear ?? null,
            }
          : {}),
        minimumGpa: child.gpa ?? null,
        minimumWam: child.wam ?? null,
        tag: null,
        freeText: child.freeText ?? null,
        hardness:
          child.hardness ?? previous?.hardness ?? existing?.hardness ?? "hard",
        sourceText: child.freeText ?? previous?.sourceText ?? null,
        sourceLocator: previous?.sourceLocator ?? null,
        reviewState: "verified",
        confidence: 1,
      });
      (child.courseCodes ?? []).forEach((code, optionIndex) => {
        next.options.push({
          conditionKey,
          position: optionIndex + 1,
          kind: "course",
          code,
          title: null,
          sourceText: null,
        });
      });
      if (
        itemKind === "course" &&
        child.courseCode &&
        (ruleKey === "prerequisite" || ruleKey === "incompatibility") &&
        !next.references.some(
          (reference) =>
            reference.ruleKey === ruleKey &&
            reference.code === child.courseCode,
        )
      ) {
        next.references.push({
          ruleKey,
          code: child.courseCode,
          sourceText: child.courseCode,
          confidence: 1,
          reviewState: "verified",
        });
      }
    });
  };
  visit(tree, null, 0);
  return next;
}
