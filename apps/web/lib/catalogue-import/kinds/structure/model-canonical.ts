import type { AcademicStructureExtraction } from "./contract.ts";

/**
 * Corrections for recurring provider slips in requirement rules, applied
 * before validation so each node keeps its typed meaning: a level condition
 * that names a subject is a subject condition, a typed condition carries no
 * free text because its sourceText holds the wording, and only a
 * minimum_count group carries a minimum count.
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
      if (
        record.operator !== "minimum_count" &&
        record.minimumCount !== null &&
        record.minimumCount !== undefined
      ) {
        record.minimumCount = null;
        normalisations.push(
          `${path}.minimumCount was cleared because the ${String(record.operator)} operator already states the group's logic.`,
        );
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replaces each requirement node the contract still refuses with a free_text
 * condition holding that node's own wording, so one malformed branch does not
 * cost the whole tree. The reviewer sees the branch as text, flagged, rather
 * than losing every requirement around it. Issue paths look like
 * `$.requirements.rule.children.3.children.0.minimumUnits`.
 */
export function repairRequirementNodes(
  value: unknown,
  issuePaths: readonly string[],
) {
  if (!isRecord(value) || !isRecord(value.requirements)) {
    return { value, repairedPaths: [] as string[] };
  }
  const repaired = structuredClone(value) as Record<string, unknown>;
  const requirements = repaired.requirements as Record<string, unknown>;
  const fallbackWording =
    typeof requirements.sourceText === "string" &&
    requirements.sourceText.trim()
      ? requirements.sourceText
      : "Requirement wording the model could not structure.";
  const nodePaths = new Set<string>();
  for (const path of issuePaths) {
    const segments = path
      .replace(/^\$\.?/, "")
      .split(/[.[\]]/)
      .filter(Boolean);
    if (segments[0] !== "requirements" || segments[1] !== "rule") continue;
    let depth = 2;
    while (
      segments[depth] === "children" &&
      /^\d+$/.test(segments[depth + 1] ?? "")
    ) {
      depth += 2;
    }
    nodePaths.add(segments.slice(2, depth).join("."));
  }
  // Deepest first: a flagged branch inside a flagged ancestor is replaced
  // before the ancestor, whose replacement then supersedes it.
  const ordered = [...nodePaths].sort(
    (left, right) => right.length - left.length,
  );
  const repairedPaths: string[] = [];
  for (const nodePath of ordered) {
    const steps = nodePath ? nodePath.split(".") : [];
    // Arrays and objects are both walked by key: the rule under
    // `requirements`, then each child index under a group's `children`.
    let container = requirements as Record<string | number, unknown>;
    let key: string | number = "rule";
    let reachable = true;
    for (let index = 0; index < steps.length; index += 2) {
      const next = container[key];
      if (!isRecord(next) || !Array.isArray(next.children)) {
        reachable = false;
        break;
      }
      container = next.children as unknown as Record<number, unknown>;
      key = Number(steps[index + 1]);
    }
    const node = reachable ? container[key] : undefined;
    if (node === undefined) continue;
    const record = isRecord(node) ? node : {};
    const wording =
      typeof record.sourceText === "string" && record.sourceText.trim()
        ? record.sourceText
        : fallbackWording;
    const replacement = {
      type: "condition",
      key:
        typeof record.key === "string" && record.key.trim()
          ? record.key
          : `requirements:repaired:${repairedPaths.length}`,
      conditionKind: "free_text",
      minimumUnits: null,
      maximumUnits: null,
      minimumCourses: null,
      courseCodes: [],
      structureKind: null,
      structureCodes: [],
      subjectCode: null,
      minimumLevel: null,
      maximumLevel: null,
      tag: null,
      freeText: wording,
      sourceText: wording,
      sourceLocator:
        typeof record.sourceLocator === "string" && record.sourceLocator.trim()
          ? record.sourceLocator
          : "requirements",
    };
    container[key] = replacement;
    repairedPaths.push(`requirements.rule${nodePath ? `.${nodePath}` : ""}`);
  }
  return { value: repaired, repairedPaths };
}
