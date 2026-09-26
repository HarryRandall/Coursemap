import type { CatalogueContent } from "./content.ts";
import {
  type CatalogueReviewUnit,
  catalogueReviewUnits,
  evidenceBelongsToReviewUnit,
  reviewUnitEvidence,
} from "./review-units.ts";

/**
 * How much a first reading needs an administrator:
 *
 * - `needs_review`: the model was unsure, flagged an error, or wrote a rule
 *   Coursemap cannot check. Publishing waits until each one is approved or
 *   corrected.
 * - `check`: probably right, but worth a look. Approve in bulk.
 * - `accepted`: stated plainly on the page. Folded away, and reopenable.
 */
export type FirstReadBand = "needs_review" | "check" | "accepted";

/** Below this the reading is a guess, and publishing waits on it. */
export const NEEDS_REVIEW_BELOW = 0.7;
/** From here up, a reading with no flags is taken as read. */
export const ACCEPTED_FROM = 0.9;

export type FirstReadItem = {
  fieldPath: string;
  unitKind: CatalogueReviewUnit["unitKind"];
  value: unknown;
  /** The weakest confidence behind the value, or null with no evidence. */
  confidence: number | null;
  band: FirstReadBand;
  /** Why it landed in its band, in words an administrator acts on. */
  reason: string;
};

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * What the model's own confidence cannot show about a requirement rule:
 * wording it could not place, conditions it left for review, and one
 * sentence split into several conditions.
 */
function ruleConcerns(content: CatalogueContent, fieldPath: string) {
  const [root, ruleKey] = fieldPath.split(".");
  if (root !== "requirements" || !ruleKey)
    return { concerns: [], lowest: null };
  const conditions = content.requirements.conditions.filter(
    (condition) => condition.ruleKey === ruleKey,
  );
  const concerns: string[] = [];
  if (conditions.some((condition) => condition.kind === "other")) {
    concerns.push("Part of the rule is free text Coursemap cannot check");
  }
  if (conditions.some((condition) => condition.reviewState === "review")) {
    concerns.push("The importer marked part of the rule for review");
  }
  const sentences = conditions
    .map((condition) => condition.sourceText?.trim())
    .filter((text): text is string => Boolean(text));
  if (new Set(sentences).size < sentences.length) {
    concerns.push("One sentence was split into several conditions");
  }
  const confidences = conditions.map((condition) => condition.confidence);
  return {
    concerns,
    lowest: confidences.length ? Math.min(...confidences) : null,
  };
}

/**
 * Every filled part of a record read from ANU for the first time, rated for
 * how much it needs a person. The model's confidence is how directly the page
 * states a value, which it tends to overrate, so its flags and Coursemap's own
 * checks on requirement rules can only move an item towards review.
 */
export function classifyFirstRead(content: CatalogueContent): FirstReadItem[] {
  return catalogueReviewUnits(content).flatMap((unit) => {
    if (isEmpty(unit.value)) return [];
    const confidences = reviewUnitEvidence(content, unit.fieldPath)
      .map((entry) => entry.confidence)
      .filter((confidence): confidence is number => confidence !== null);
    const flags = content.flags.filter((flag) =>
      evidenceBelongsToReviewUnit(unit.fieldPath, flag.fieldPath),
    );
    const rule = ruleConcerns(content, unit.fieldPath);
    const candidates = [
      ...confidences,
      ...(rule.lowest === null ? [] : [rule.lowest]),
    ];
    const confidence = candidates.length ? Math.min(...candidates) : null;
    const error = flags.find((flag) => flag.severity === "error");
    const warning = flags.find((flag) => flag.severity === "warning");

    let band: FirstReadBand;
    let reason: string;
    if (error) {
      band = "needs_review";
      reason = error.message;
    } else if (rule.concerns.length) {
      band = "needs_review";
      reason = rule.concerns.join(". ");
    } else if (confidence !== null && confidence < NEEDS_REVIEW_BELOW) {
      band = "needs_review";
      reason = "The page does not state this plainly";
    } else if (warning) {
      band = "check";
      reason = warning.message;
    } else if (confidence === null) {
      band = "check";
      reason = "No evidence was given for this";
    } else if (confidence < ACCEPTED_FROM) {
      band = "check";
      reason = "Probably right, worth a look";
    } else {
      band = "accepted";
      reason = "Stated plainly on the page";
    }
    return [
      {
        fieldPath: unit.fieldPath,
        unitKind: unit.unitKind,
        value: unit.value,
        confidence,
        band,
        reason,
      },
    ];
  });
}
