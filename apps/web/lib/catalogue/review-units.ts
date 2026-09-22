import type {
  CatalogueContent,
  CatalogueVersionProvenance,
  RequirementRuleKind,
  RequirementWrite,
} from "./content.ts";

/**
 * A review unit is the smallest piece of catalogue content that an
 * administrator accepts or rejects as a whole. Scalars stand alone, named
 * collections review whole because their children have no stable identity to
 * merge on, and each requirement rule reviews separately so a prerequisite
 * decision never carries an incompatibility change with it.
 */
export type CatalogueReviewUnitKind =
  "scalar" | "collection" | "requirement_rule";

export type CatalogueReviewUnit = {
  fieldPath: string;
  unitKind: CatalogueReviewUnitKind;
  value: unknown;
};

const COURSE_COLLECTIONS = [
  "unitOptions",
  "fees",
  "areasOfInterest",
  "attributes",
  "relatedCourses",
  "offering",
  "sessions",
  "learningOutcomes",
  "assessmentItems",
  "assessmentOutcomes",
] as const;

const STRUCTURE_COLLECTIONS = [
  "summaryFields",
  "sections",
  "learningOutcomes",
  "fees",
  "relationships",
] as const;

/** The subset of requirements belonging to one rule, for per-rule comparison. */
export function requirementRuleSlice(
  requirements: RequirementWrite,
  ruleKey: RequirementRuleKind,
) {
  const rule = requirements.rules.find(
    (candidate) => candidate.key === ruleKey,
  );
  if (!rule) return null;
  const conditionKeys = new Set(
    requirements.conditions
      .filter((condition) => condition.ruleKey === ruleKey)
      .map((condition) => condition.key),
  );
  return {
    rule,
    groups: requirements.groups.filter((group) => group.ruleKey === ruleKey),
    conditions: requirements.conditions.filter(
      (condition) => condition.ruleKey === ruleKey,
    ),
    options: requirements.options.filter((option) =>
      conditionKeys.has(option.conditionKey),
    ),
    references: requirements.references.filter(
      (reference) => reference.ruleKey === ruleKey,
    ),
  };
}

/**
 * Every review unit the content carries, in reading order: kind-specific
 * scalars, then kind-specific collections, then one unit per requirement rule.
 */
export function catalogueReviewUnits(
  content: CatalogueContent | null,
): CatalogueReviewUnit[] {
  if (!content) return [];
  const units: CatalogueReviewUnit[] = [];
  if (content.course) {
    for (const key of Object.keys(content.course.details)) {
      units.push({
        fieldPath: `course.details.${key}`,
        unitKind: "scalar",
        value:
          content.course.details[key as keyof typeof content.course.details],
      });
    }
    for (const key of COURSE_COLLECTIONS) {
      units.push({
        fieldPath: `course.${key}`,
        unitKind: "collection",
        value: content.course[key],
      });
    }
  }
  if (content.structure) {
    for (const key of Object.keys(content.structure.details)) {
      units.push({
        fieldPath: `structure.details.${key}`,
        unitKind: "scalar",
        value:
          content.structure.details[
            key as keyof typeof content.structure.details
          ],
      });
    }
    for (const key of STRUCTURE_COLLECTIONS) {
      units.push({
        fieldPath: `structure.${key}`,
        unitKind: "collection",
        value: content.structure[key],
      });
    }
  }
  for (const rule of content.requirements.rules) {
    units.push({
      fieldPath: `requirements.${rule.key}`,
      unitKind: "requirement_rule",
      value: requirementRuleSlice(content.requirements, rule.key),
    });
  }
  return units;
}

export function catalogueReviewUnitMap(content: CatalogueContent | null) {
  return new Map(
    catalogueReviewUnits(content).map((unit) => [unit.fieldPath, unit]),
  );
}

/**
 * Evidence and flags carry extraction field keys rather than review paths, so
 * a unit claims the entries naming it, its leaf or a child of either. Entries
 * that match nothing stay with the content they were already on, because an
 * accepted field must never relabel a field nobody decided on.
 */
export function evidenceBelongsToReviewUnit(
  fieldPath: string,
  evidencePath: string | null,
) {
  if (!evidencePath) return false;
  const leaf = fieldPath.split(".").pop() ?? fieldPath;
  return (
    evidencePath === fieldPath ||
    evidencePath === leaf ||
    evidencePath.startsWith(`${fieldPath}.`) ||
    evidencePath.startsWith(`${leaf}.`) ||
    evidencePath.endsWith(`.${leaf}`)
  );
}

export function reviewUnitEvidence(
  content: CatalogueContent,
  fieldPath: string,
): CatalogueVersionProvenance[] {
  return content.evidence.filter((entry) =>
    evidenceBelongsToReviewUnit(fieldPath, entry.fieldPath),
  );
}

type Section = Record<string, unknown>;

/**
 * The baseline with the candidate's value at each given review path, and with
 * evidence and flags moved for those paths only. Requirement paths replace the
 * whole rule slice. Unnamed paths keep the baseline's value, evidence and
 * flags untouched.
 */
export function applyReviewUnits(
  baseline: CatalogueContent,
  candidate: CatalogueContent,
  paths: ReadonlySet<string>,
): CatalogueContent {
  const result: CatalogueContent = structuredClone(baseline);
  const replacedRules = new Set<RequirementRuleKind>();

  for (const path of paths) {
    const [root, ...rest] = path.split(".");
    if (root === "requirements" && rest.length === 1) {
      replacedRules.add(rest[0] as RequirementRuleKind);
      continue;
    }
    if ((root === "course" || root === "structure") && candidate[root]) {
      if (!result[root]) {
        result[root] = structuredClone(candidate[root]) as never;
        continue;
      }
      const target = result[root] as unknown as Section;
      const source = candidate[root] as unknown as Section;
      if (rest[0] === "details" && rest.length === 2) {
        (target.details as Section)[rest[1]!] = structuredClone(
          (source.details as Section)[rest[1]!],
        );
      } else if (rest.length === 1) {
        target[rest[0]!] = structuredClone(source[rest[0]!]);
      }
    }
  }

  if (replacedRules.size > 0) {
    const keep = (ruleKey: RequirementRuleKind) => !replacedRules.has(ruleKey);
    const baseConditions = result.requirements.conditions.filter((condition) =>
      keep(condition.ruleKey),
    );
    const baseConditionKeys = new Set(
      baseConditions.map((condition) => condition.key),
    );
    const merged: RequirementWrite = {
      rules: result.requirements.rules.filter((rule) => keep(rule.key)),
      groups: result.requirements.groups.filter((group) => keep(group.ruleKey)),
      conditions: baseConditions,
      options: result.requirements.options.filter((option) =>
        baseConditionKeys.has(option.conditionKey),
      ),
      references: result.requirements.references.filter((reference) =>
        keep(reference.ruleKey),
      ),
    };
    for (const ruleKey of replacedRules) {
      const slice = requirementRuleSlice(candidate.requirements, ruleKey);
      if (!slice) continue;
      merged.rules.push(slice.rule);
      merged.groups.push(...slice.groups);
      merged.conditions.push(...slice.conditions);
      merged.options.push(...slice.options);
      merged.references.push(...slice.references);
    }
    result.requirements = structuredClone(merged);
  }

  const claimed = (entryPath: string | null) =>
    [...paths].some((path) => evidenceBelongsToReviewUnit(path, entryPath));
  result.evidence = [
    ...result.evidence.filter((entry) => !claimed(entry.fieldPath)),
    ...candidate.evidence.filter((entry) => claimed(entry.fieldPath)),
  ];
  result.flags = [
    ...result.flags.filter((flag) => !claimed(flag.fieldPath)),
    ...candidate.flags.filter((flag) => claimed(flag.fieldPath)),
  ];
  return result;
}
