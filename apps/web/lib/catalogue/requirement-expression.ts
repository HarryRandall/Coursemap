import type { CourseRuleExpression } from "../coursemap/course-types.ts";
import type { RequirementWrite } from "./content.ts";

/** One rule's share of a record's requirements, as review units carry it. */
export type RequirementRuleSlice = {
  rule?: RequirementWrite["rules"][number] | null;
  groups?: RequirementWrite["groups"];
  conditions?: RequirementWrite["conditions"];
  options?: RequirementWrite["options"];
};

type Condition = RequirementWrite["conditions"][number];

function conditionExpression(
  condition: Condition,
  optionCodes: string[],
): CourseRuleExpression {
  const base = {
    confidence: condition.confidence,
    hardness: condition.hardness,
    reviewState: condition.reviewState,
    sourceText: condition.sourceText ?? "",
  };
  const text = condition.freeText ?? condition.sourceText ?? "";
  const units = condition.minimumUnits;
  switch (condition.kind) {
    case "course":
      if (condition.itemCode) {
        return {
          ...base,
          kind: "course",
          code: condition.itemCode.toUpperCase(),
          minimumMark: condition.minimumMark,
          requirementMode: condition.requirementMode ?? "completed",
        };
      }
      break;
    case "incompatible":
      if (condition.itemCode) {
        return {
          ...base,
          kind: "incompatible",
          code: condition.itemCode.toUpperCase(),
        };
      }
      break;
    case "units_total":
    case "subject_units":
      if (units !== null) {
        return {
          ...base,
          kind: condition.kind,
          subject: condition.subjectCode,
          units,
        };
      }
      break;
    case "level_units":
      if (units !== null && condition.minimumLevel !== null) {
        return {
          ...base,
          kind: "level_units",
          maximumLevel: condition.maximumLevel,
          minimumLevel: condition.minimumLevel,
          subject: condition.subjectCode,
          units,
        };
      }
      break;
    case "course_set_units":
      if (units !== null && optionCodes.length) {
        return {
          ...base,
          kind: "course_set_units",
          courseCodes: optionCodes,
          units,
        };
      }
      break;
    case "tagged_units":
      if (units !== null && condition.tag) {
        return { ...base, kind: "tagged_units", tag: condition.tag, units };
      }
      break;
    case "elective_units":
      if (units !== null) return { ...base, kind: "elective_units", units };
      break;
    case "year_standing":
      if (condition.minimumYear !== null) {
        return {
          ...base,
          kind: "year_standing",
          minimumYear: condition.minimumYear,
        };
      }
      break;
    case "structure":
      return {
        ...base,
        kind: "structure",
        structureCode: condition.itemCode,
        text: condition.freeText,
      };
    case "structure_set":
      return {
        ...base,
        kind: "structure_set",
        minimumCount: condition.minimumCount,
        structureCodes: optionCodes,
        structureKind: condition.structureKind,
      };
    case "gpa":
      if (condition.minimumGpa !== null) {
        return { ...base, kind: "gpa", minimumGpa: condition.minimumGpa };
      }
      break;
    case "wam":
      if (condition.minimumWam !== null) {
        return { ...base, kind: "wam", minimumWam: condition.minimumWam };
      }
      break;
    case "permission":
      return { ...base, kind: "permission", text };
  }
  return { ...base, kind: "other", text };
}

/**
 * A rule's groups and conditions as the expression tree the course page draws,
 * so a review shows a reading the way a student will see it. Returns null when
 * the rule has no root group to start from.
 */
export function requirementSliceExpression(
  slice: RequirementRuleSlice,
): CourseRuleExpression | null {
  const groups = slice.groups ?? [];
  const conditions = slice.conditions ?? [];
  const optionCodes = new Map<string, string[]>();
  for (const option of [...(slice.options ?? [])].sort(
    (left, right) => left.position - right.position,
  )) {
    const list = optionCodes.get(option.conditionKey) ?? [];
    list.push(option.code.toUpperCase());
    optionCodes.set(option.conditionKey, list);
  }

  const visit = (
    key: string,
    ancestors: ReadonlySet<string>,
  ): CourseRuleExpression | null => {
    const group = groups.find((candidate) => candidate.key === key);
    if (!group || ancestors.has(key)) return null;
    const next = new Set(ancestors).add(key);
    const children = [
      ...groups
        .filter((candidate) => candidate.parentKey === key)
        .map((child) => ({
          position: child.position,
          expression: visit(child.key, next),
        })),
      ...conditions
        .filter((candidate) => candidate.groupKey === key)
        .map((condition) => ({
          position: condition.position,
          expression: conditionExpression(
            condition,
            optionCodes.get(condition.key) ?? [],
          ),
        })),
    ]
      .sort((left, right) => left.position - right.position)
      .flatMap(({ expression }) => (expression ? [expression] : []));
    if (children.length === 0) return null;
    return {
      kind: "group",
      operator: group.operator,
      minimumCount: group.minimumCount,
      conditions: children,
    };
  };

  const roots = groups
    .filter((group) => group.parentKey === null)
    .sort((left, right) => left.position - right.position)
    .flatMap((group) => {
      const expression = visit(group.key, new Set());
      return expression ? [expression] : [];
    });
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0]!;
  return {
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: roots,
  };
}
