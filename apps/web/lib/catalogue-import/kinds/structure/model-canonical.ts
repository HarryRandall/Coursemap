import type { AcademicStructureExtraction } from "./contract.ts";

/**
 * Corrections for two recurring provider slips in requirement conditions,
 * applied before validation so the condition keeps its typed meaning: a level
 * condition that names a subject is a subject condition, and a typed
 * condition carries no free text because its sourceText holds the wording.
 */
export function normaliseAcademicStructureModelExtraction(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value, normalisations: [] as string[] };
  }

  const normalised = structuredClone(value) as Record<string, unknown>;
  const normalisations: string[] = [];
  const requirements = normalised.requirements;
  if (
    typeof requirements !== "object" ||
    requirements === null ||
    Array.isArray(requirements)
  ) {
    return { value: normalised, normalisations };
  }

  const visitRule = (rule: unknown, path: string) => {
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      return;
    }
    const record = rule as Record<string, unknown>;
    if (record.type === "group" && Array.isArray(record.children)) {
      record.children.forEach((child, index) =>
        visitRule(child, `${path}.children.${index}`),
      );
      return;
    }
    if (
      record.type === "condition" &&
      record.conditionKind === "level" &&
      typeof record.subjectCode === "string" &&
      record.subjectCode.trim() !== ""
    ) {
      record.conditionKind = "subject";
      normalisations.push(
        `${path}.conditionKind was changed from level to subject because the condition includes subjectCode.`,
      );
    }
    if (
      record.type === "condition" &&
      record.conditionKind !== "free_text" &&
      typeof record.freeText === "string"
    ) {
      record.freeText = null;
      normalisations.push(
        `${path}.freeText was cleared because sourceText already preserves the condition wording.`,
      );
    }
  };

  visitRule(
    (requirements as Record<string, unknown>).rule,
    "$.requirements.rule",
  );
  return { value: normalised, normalisations };
}

/**
 * The projection stores a requirement tree under one root group. A model that
 * returns a single condition as the whole rule gets that group around it.
 */
export function ensureRequirementRootGroup(
  requirements: AcademicStructureExtraction["requirements"],
) {
  const rule = requirements.rule;
  if (!rule || rule.type === "group") return requirements;
  return {
    ...requirements,
    rule: {
      type: "group" as const,
      key:
        rule.key === "requirements:root"
          ? "requirements:root-group"
          : "requirements:root",
      operator: "all_of" as const,
      minimumCount: null,
      title: "Requirements",
      sourceText: requirements.sourceText ?? rule.sourceText,
      sourceLocator: requirements.sourceLocator ?? rule.sourceLocator,
      children: [rule],
    },
  };
}
