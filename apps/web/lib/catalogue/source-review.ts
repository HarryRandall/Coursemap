import {
  stableFingerprint,
  stableStringify,
} from "../catalogue-import/canonical.ts";
import {
  type CatalogueReviewUnitKind,
  catalogueReviewUnitMap,
} from "./review-units.ts";
import type { CatalogueContent } from "./content.ts";

/**
 * What a review unit means once the previous ANU value, the local value and
 * the new ANU value are all known. Reducing the comparison to "local differs
 * from incoming" loses the difference between an ordinary ANU change and a
 * conflict, which is the only thing that decides whether the administrator has
 * something to weigh up.
 */
export type SourceChangeClassification =
  "source_change" | "local_override" | "conflict" | "converged" | "first_read";

/** Classifications that ask the administrator for a decision. */
export const ACTIONABLE_SOURCE_CLASSIFICATIONS: readonly SourceChangeClassification[] =
  ["source_change", "conflict"];

export type ClassifiedSourceChange = {
  fieldPath: string;
  unitKind: CatalogueReviewUnitKind;
  classification: SourceChangeClassification;
  baseSourceValue: unknown;
  localValue: unknown;
  incomingSourceValue: unknown;
  localValueHash: string;
  position: number;
};

function same(left: unknown, right: unknown) {
  return stableStringify(left ?? null) === stableStringify(right ?? null);
}

/** Nothing an administrator authored: an absent, blank or empty unit value. */
function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function reviewValueHash(value: unknown) {
  return stableFingerprint(value ?? null);
}

/**
 * The truth table this branch exists for.
 *
 * | Previous ANU | Local | New ANU | Classification |
 * | ------------ | ----- | ------- | -------------- |
 * | A            | A     | A       | no row         |
 * | A            | B     | A       | local_override |
 * | A            | A     | C       | source_change  |
 * | A            | B     | C       | conflict       |
 * | A            | C     | C       | converged      |
 *
 * With no previous ANU value the record was authored before ANU was ever
 * seen, so agreement is convergence, an empty local value is an ordinary
 * source change, and anything else is a conflict between two independent
 * authors.
 */
export function classifySourceChange({
  hasBaseSource,
  baseSourceValue,
  localValue,
  incomingSourceValue,
}: {
  hasBaseSource: boolean;
  baseSourceValue: unknown;
  localValue: unknown;
  incomingSourceValue: unknown;
}): SourceChangeClassification | null {
  const localMatchesIncoming = same(localValue, incomingSourceValue);
  if (!hasBaseSource) {
    if (localMatchesIncoming) return "converged";
    return isEmptyValue(localValue) ? "source_change" : "conflict";
  }
  const baseMatchesLocal = same(baseSourceValue, localValue);
  const baseMatchesIncoming = same(baseSourceValue, incomingSourceValue);
  if (localMatchesIncoming) return baseMatchesLocal ? null : "converged";
  if (baseMatchesIncoming) return "local_override";
  if (baseMatchesLocal) return "source_change";
  return "conflict";
}

/**
 * Every review unit of one source observation, in reading order. Units where
 * all three states agree produce no row at all.
 */
export function classifySourceReview({
  baseSource,
  local,
  incomingSource,
}: {
  baseSource: CatalogueContent | null;
  local: CatalogueContent | null;
  incomingSource: CatalogueContent;
}): ClassifiedSourceChange[] {
  const base = catalogueReviewUnitMap(baseSource);
  const current = catalogueReviewUnitMap(local);
  const incoming = catalogueReviewUnitMap(incomingSource);
  const paths = [
    ...incoming.keys(),
    ...[...current.keys()].filter((path) => !incoming.has(path)),
    ...[...base.keys()].filter(
      (path) => !incoming.has(path) && !current.has(path),
    ),
  ];

  const changes: ClassifiedSourceChange[] = [];
  for (const fieldPath of paths) {
    const unit =
      incoming.get(fieldPath) ?? current.get(fieldPath) ?? base.get(fieldPath)!;
    const baseSourceValue = base.get(fieldPath)?.value ?? null;
    const localValue = current.get(fieldPath)?.value ?? null;
    const incomingSourceValue = incoming.get(fieldPath)?.value ?? null;
    const classification = classifySourceChange({
      hasBaseSource: baseSource !== null,
      baseSourceValue,
      localValue,
      incomingSourceValue,
    });
    if (!classification) continue;
    changes.push({
      fieldPath,
      unitKind: unit.unitKind,
      classification,
      baseSourceValue,
      localValue,
      incomingSourceValue,
      localValueHash: reviewValueHash(localValue),
      position: changes.length,
    });
  }
  return changes;
}

/**
 * Reclassifies a stored row against the draft as it stands now. An
 * administrator who edited the same path after the review was generated has
 * created a real three-way divergence, so the row becomes a conflict and shows
 * the value they actually have. Editing any other path changes nothing here,
 * which is what makes source application path-safe rather than draft-global.
 */
export function reclassifyAgainstDraft(
  change: Pick<
    ClassifiedSourceChange,
    | "classification"
    | "baseSourceValue"
    | "localValue"
    | "incomingSourceValue"
    | "localValueHash"
  >,
  draftValue: unknown,
): {
  classification: SourceChangeClassification;
  localValue: unknown;
  isStale: boolean;
} {
  const isStale = reviewValueHash(draftValue) !== change.localValueHash;
  if (!isStale) {
    return {
      classification: change.classification,
      localValue: change.localValue,
      isStale: false,
    };
  }
  if (same(draftValue, change.incomingSourceValue)) {
    return { classification: "converged", localValue: draftValue, isStale };
  }
  if (change.classification === "source_change") {
    return { classification: "conflict", localValue: draftValue, isStale };
  }
  return {
    classification: change.classification,
    localValue: draftValue,
    isStale,
  };
}
