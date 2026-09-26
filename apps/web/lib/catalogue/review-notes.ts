import { evidenceBelongsToReviewUnit } from "./review-units.ts";

/** One note the model left on a source version. */
export type VersionFlag = {
  fieldPath: string | null;
  severity: "warning" | "error";
  code: string;
  message: string;
};

/** The model's evidence for one field, and how directly the page states it. */
export type VersionEvidence = {
  fieldPath: string;
  confidence: number | null;
  excerpt: string | null;
};

export type ReviewNote = {
  fieldPath: string | null;
  label: string;
  message: string;
};

export type UncertainField = {
  fieldPath: string;
  label: string;
  confidence: number;
  excerpt: string | null;
};

/** Below this, a field is worth reading against the ANU page. */
export const UNCERTAIN_CONFIDENCE = 0.8;

const FIELD_NAMES: Record<string, string> = {
  modelExtraction: "The whole response",
  prerequisiteRule: "Prerequisite rule",
  corequisiteRule: "Corequisite rule",
  prerequisiteText: "Prerequisite wording",
  corequisiteText: "Corequisite wording",
  incompatibilityText: "Incompatibility wording",
  incompatibilityCourseCodes: "Incompatible courses",
  softIncompatibilityCourseCodes: "Advisory incompatibilities",
  unmodelledText: "Unmodelled requirement wording",
  unitValue: "Units",
  eftsl: "EFTSL",
  totalUnits: "Units",
  durationYears: "Length",
  selectionRank: "Selection rank",
  atar: "ATAR",
  learningOutcomes: "Learning outcomes",
  assessmentItems: "Assessment",
  offerings: "Offerings",
  summaryFields: "Key facts",
  relationships: "Related structures",
  requirements: "Requirements",
  rule: "Requirement tree",
  sourceUpdatedAt: "ANU update date",
  areasOfInterest: "Areas of interest",
  tags: "Tags",
  relatedCourses: "Related courses",
  contactText: "Contact",
  convenerText: "Convener",
};

function humanise(segment: string) {
  const words = segment.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A field path from the model's extraction, such as `requisites.prerequisiteRule`,
 * `fees[2]` or `requirements.rule.children.3`, in words an administrator reads.
 * The section a path belongs to leads; an array index becomes an item number
 * and a requirement branch keeps its position.
 */
export function modelFieldLabel(fieldPath: string | null) {
  if (!fieldPath) return "The record";
  const segments = fieldPath.split(/[.[\]]/).filter(Boolean);
  const names: string[] = [];
  const branch: number[] = [];
  let inRequirementTree = false;
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      if (inRequirementTree) branch.push(Number(segment) + 1);
      else names.push(`item ${Number(segment) + 1}`);
      continue;
    }
    if (segment === "rule" && names.at(-1) === FIELD_NAMES.requirements) {
      inRequirementTree = true;
      continue;
    }
    if (segment === "children" || segment === "requisites") continue;
    names.push(FIELD_NAMES[segment] ?? humanise(segment));
  }
  // Sentence case: only the first name keeps its capital, unless a later one
  // is an initialism such as ATAR.
  const label = names
    .map((name, index) =>
      index > 0 && /^[A-Z][a-z]/.test(name)
        ? name.charAt(0).toLowerCase() + name.slice(1)
        : name,
    )
    .join(", ");
  return branch.length ? `${label}, branch ${branch.join(".")}` : label;
}

/**
 * What the Changes tab asks an administrator to check: every error, every
 * warning, and each field whose weakest evidence falls below
 * `UNCERTAIN_CONFIDENCE`, least certain first.
 */
export function summariseReviewNotes({
  flags,
  evidence,
}: {
  flags: readonly VersionFlag[];
  evidence: readonly VersionEvidence[];
}) {
  const note = (flag: VersionFlag): ReviewNote => ({
    fieldPath: flag.fieldPath,
    label: modelFieldLabel(flag.fieldPath),
    message: flag.message,
  });
  const weakest = new Map<string, UncertainField>();
  for (const item of evidence) {
    if (item.confidence === null || item.confidence >= UNCERTAIN_CONFIDENCE) {
      continue;
    }
    const current = weakest.get(item.fieldPath);
    if (!current || item.confidence < current.confidence) {
      weakest.set(item.fieldPath, {
        fieldPath: item.fieldPath,
        label: modelFieldLabel(item.fieldPath),
        confidence: item.confidence,
        excerpt: item.excerpt,
      });
    }
  }
  return {
    errors: flags.filter(({ severity }) => severity === "error").map(note),
    warnings: flags.filter(({ severity }) => severity === "warning").map(note),
    uncertain: [...weakest.values()].sort(
      (left, right) => left.confidence - right.confidence,
    ),
  };
}

// The course model names requisites by their wording or rule, where review
// units name the requirement rule itself.
const REQUISITE_RULES: Record<string, string> = {
  prerequisite: "prerequisite",
  corequisite: "corequisite",
  incompatibility: "incompatibility",
  softIncompatibility: "incompatibility",
};

/** Whether a note from the model is about the given review unit. */
export function noteBelongsToReviewUnit(
  fieldPath: string,
  notePath: string | null,
) {
  if (evidenceBelongsToReviewUnit(fieldPath, notePath)) return true;
  const requisite = notePath?.match(
    /^(?:requisites\.)?([a-zA-Z]+?)(?:Rule|Text|CourseCodes)$/,
  )?.[1];
  const rule = requisite ? REQUISITE_RULES[requisite] : undefined;
  return rule !== undefined && fieldPath === `requirements.${rule}`;
}
