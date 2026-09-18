import { stableStringify } from "./canonical.ts";
import { fieldLabel } from "../coursemap/catalogue-kinds.ts";
import type {
  CatalogueSnapshotWrite,
  RequirementRuleKind,
  RequirementWrite,
  SnapshotFlagWrite,
} from "./snapshot-write.ts";

export type SnapshotChange = {
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  summary: string;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
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
  "sections",
  "learningOutcomes",
  "fees",
  "relationships",
] as const;

function same(left: unknown, right: unknown) {
  return stableStringify(left ?? null) === stableStringify(right ?? null);
}

function describe(value: unknown) {
  if (value === null || value === undefined) return "nothing";
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "a value";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

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
 * Field-level differences between two snapshot writes. Scalars diff one by
 * one; collections and requirement rules diff as whole sections so a review
 * decision replaces the section rather than merging arrays item by item.
 */
export function diffSnapshotWrites(
  baseline: CatalogueSnapshotWrite | null,
  candidate: CatalogueSnapshotWrite,
): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const evidenceFor = (fieldPath: string) => {
    const leaf = fieldPath.split(".").pop() ?? fieldPath;
    return candidate.evidence.find(
      (item) =>
        item.fieldPath === fieldPath ||
        item.fieldPath === leaf ||
        item.fieldPath.endsWith(`.${leaf}`),
    );
  };
  const push = (fieldPath: string, oldValue: unknown, newValue: unknown) => {
    if (same(oldValue, newValue)) return;
    const evidence = evidenceFor(fieldPath);
    changes.push({
      fieldPath,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      summary: `${fieldLabel(fieldPath)}: ${describe(oldValue)} → ${describe(newValue)}`,
      sourceLocator: evidence?.sourceLocator ?? null,
      sourceExcerpt: evidence?.sourceExcerpt ?? null,
    });
  };

  if (candidate.course) {
    const before = baseline?.course ?? null;
    for (const key of Object.keys(candidate.course.details) as Array<
      keyof typeof candidate.course.details
    >) {
      push(
        `course.details.${key}`,
        before?.details[key],
        candidate.course.details[key],
      );
    }
    for (const key of COURSE_COLLECTIONS) {
      push(`course.${key}`, before?.[key], candidate.course[key]);
    }
  }
  if (candidate.structure) {
    const before = baseline?.structure ?? null;
    for (const key of Object.keys(candidate.structure.details) as Array<
      keyof typeof candidate.structure.details
    >) {
      push(
        `structure.details.${key}`,
        before?.details[key],
        candidate.structure.details[key],
      );
    }
    for (const key of STRUCTURE_COLLECTIONS) {
      push(`structure.${key}`, before?.[key], candidate.structure[key]);
    }
  }
  const ruleKeys = new Set<RequirementRuleKind>([
    ...(baseline?.requirements.rules.map((rule) => rule.key) ?? []),
    ...candidate.requirements.rules.map((rule) => rule.key),
  ]);
  for (const ruleKey of ruleKeys) {
    push(
      `requirements.${ruleKey}`,
      baseline ? requirementRuleSlice(baseline.requirements, ruleKey) : null,
      requirementRuleSlice(candidate.requirements, ruleKey),
    );
  }
  return changes;
}

/** Errors block publication; warnings inform. */
export function isBlockingFlag(flag: SnapshotFlagWrite) {
  return flag.severity === "error";
}

type Section = Record<string, unknown>;

/**
 * Builds the write to save when applying a review: the baseline with every
 * accepted change's new value set at its field path. Requirement rule paths
 * replace the whole rule slice.
 */
export function applyAcceptedChanges(
  baseline: CatalogueSnapshotWrite,
  candidate: CatalogueSnapshotWrite,
  acceptedPaths: ReadonlySet<string>,
): CatalogueSnapshotWrite {
  const result: CatalogueSnapshotWrite = structuredClone(baseline);
  result.evidence = candidate.evidence;
  result.flags = candidate.flags;
  const replacedRules = new Set<RequirementRuleKind>();

  for (const path of acceptedPaths) {
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
  return result;
}
