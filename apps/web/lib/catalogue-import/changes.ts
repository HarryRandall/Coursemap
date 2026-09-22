import { stableStringify } from "./canonical.ts";
import { fieldLabel } from "../coursemap/catalogue-kinds.ts";
import {
  catalogueReviewUnitMap,
  catalogueReviewUnits,
} from "../catalogue/review-units.ts";
import type {
  CatalogueContent,
  CatalogueContentFlag,
} from "../catalogue/content.ts";

export type SnapshotChange = {
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  summary: string;
  sourceLocator: string | null;
  sourceExcerpt: string | null;
};

export function sameReviewValue(left: unknown, right: unknown) {
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

/** One readable line for an audit row or a review heading. */
export function changeSummary(
  fieldPath: string,
  oldValue: unknown,
  newValue: unknown,
) {
  return `${fieldLabel(fieldPath)}: ${describe(oldValue)} → ${describe(newValue)}`;
}

/**
 * Field-level differences between two catalogue writes, over the review units
 * in `lib/catalogue/review-units.ts`: scalars one by one, collections and
 * requirement rules whole.
 */
export function diffSnapshotWrites(
  baseline: CatalogueContent | null,
  candidate: CatalogueContent,
): SnapshotChange[] {
  const before = catalogueReviewUnitMap(baseline);
  const evidenceFor = (fieldPath: string) => {
    const leaf = fieldPath.split(".").pop() ?? fieldPath;
    return candidate.evidence.find(
      (item) =>
        item.fieldPath === fieldPath ||
        item.fieldPath === leaf ||
        item.fieldPath.endsWith(`.${leaf}`),
    );
  };
  const changes: SnapshotChange[] = [];
  const units = [
    ...catalogueReviewUnits(candidate),
    // A rule the candidate dropped still has to be reported as a removal.
    ...[...before.values()].filter(
      (unit) =>
        unit.unitKind === "requirement_rule" &&
        !candidate.requirements.rules.some(
          (rule) => `requirements.${rule.key}` === unit.fieldPath,
        ),
    ),
  ];
  for (const unit of units) {
    const oldValue = before.get(unit.fieldPath)?.value ?? null;
    const newValue =
      unit.unitKind === "requirement_rule" &&
      !candidate.requirements.rules.some(
        (rule) => `requirements.${rule.key}` === unit.fieldPath,
      )
        ? null
        : unit.value;
    if (sameReviewValue(oldValue, newValue)) continue;
    const evidence = evidenceFor(unit.fieldPath);
    changes.push({
      fieldPath: unit.fieldPath,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      summary: changeSummary(unit.fieldPath, oldValue, newValue),
      sourceLocator: evidence?.sourceLocator ?? null,
      sourceExcerpt: evidence?.sourceExcerpt ?? null,
    });
  }
  return changes;
}

/** Errors block publication; warnings inform. */
export function isBlockingFlag(flag: CatalogueContentFlag) {
  return flag.severity === "error";
}
