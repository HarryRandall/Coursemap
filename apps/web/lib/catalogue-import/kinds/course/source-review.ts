import { parsePlainCourseRequisites } from "./plain-requisites.ts";
import { unsupportedModelWording } from "../../model-evidence.ts";
import type {
  CourseExtraction,
  CourseExtractionReviewItem,
  CourseRequisites,
  CourseRule,
} from "./contract.ts";

/** ANU's unqualified incompatibility excludes both past and current enrolment. */
export function reconcileBareIncompatibilities({
  requisites,
  pageMarkdown,
}: {
  requisites: CourseRequisites;
  pageMarkdown: string;
}): {
  requisites: CourseRequisites;
  reviewItems: CourseExtractionReviewItem[];
} {
  const sourceSection =
    pageMarkdown
      .split(/^## Requisite and Incompatibility\s*$/mu)[1]
      ?.split(/^## /mu)[0] ?? "";
  const plainSection = sourceSection.replace(
    /\[([A-Z]{4}\d{4})\]\([^)]*\)/gu,
    "$1",
  );
  const sourceCodes = new Set<string>();
  for (const match of plainSection.matchAll(
    /\bIncompatible with\s+([^.!?\n]+)(?:[.!?]|$)/giu,
  )) {
    const list = match[1]
      .trim()
      .replace(/,\s*(?:and|or)\s+/giu, ",")
      .replace(/\s+(?:and|or)\s+/giu, ",");
    if (!/^[A-Z]{4}\d{4}(?:\s*,\s*[A-Z]{4}\d{4})*$/iu.test(list)) continue;
    for (const code of list.split(/\s*,\s*/u))
      sourceCodes.add(code.toUpperCase());
  }

  const concurrent = new Set(
    requisites.concurrentIncompatibilityCourseCodes ?? [],
  );
  const added: string[] = [];
  const reviewItems: CourseExtractionReviewItem[] = [];
  for (const code of sourceCodes) {
    const isHardCompletion =
      requisites.incompatibilityCourseCodes.includes(code);
    const isSoft =
      requisites.softIncompatibilityCourseCodes.includes(code) ||
      (requisites.softConcurrentIncompatibilityCourseCodes ?? []).includes(
        code,
      );
    if (isHardCompletion && concurrent.has(code) && !isSoft) continue;
    if (!isHardCompletion || isSoft || requisites.incompatibilityRule) {
      reviewItems.push({
        fieldKey: "requisites.concurrentIncompatibilityCourseCodes",
        kind: "missing",
        severity: "error",
        message: `ANU lists ${code} as incompatible, but the extracted exclusions do not safely cover both past and concurrent enrolment. Review the clause before publication.`,
      });
      continue;
    }
    concurrent.add(code);
    added.push(code);
  }
  if (added.length)
    reviewItems.push({
      fieldKey: "requisites.concurrentIncompatibilityCourseCodes",
      kind: "missing",
      severity: "warning",
      message: `ANU's unqualified incompatibility also excludes concurrent enrolment in ${added.join(", ")}; this scope was added to the model's completed-course exclusions.`,
    });
  return {
    requisites: added.length
      ? { ...requisites, concurrentIncompatibilityCourseCodes: [...concurrent] }
      : requisites,
    reviewItems,
  };
}

/** A college identity must be source-backed, even when the clause abbreviates it. */
function unsupportedCollegeNames(
  rule: CourseRule | null,
  pageMarkdown: string,
): string[] {
  if (!rule) return [];
  if (rule.op === "all_of" || rule.op === "one_of")
    return rule.rules.flatMap((child) =>
      unsupportedCollegeNames(child, pageMarkdown),
    );
  if (rule.op !== "enrolled_in_college") return [];
  return unsupportedModelWording(
    { college: { sourceText: rule.college } },
    pageMarkdown,
  ).length
    ? [rule.college]
    : [];
}

function hasCollegeEnrolment(rule: CourseRule | null): boolean {
  if (!rule) return false;
  if (rule.op === "enrolled_in_college") return true;
  if (rule.op === "all_of" || rule.op === "one_of")
    return rule.rules.some(hasCollegeEnrolment);
  return false;
}

function hasMinimumGpa(rule: CourseRule | null): boolean {
  if (!rule) return false;
  if (rule.op === "minimum_gpa") return true;
  if (rule.op === "all_of" || rule.op === "one_of")
    return rule.rules.some(hasMinimumGpa);
  return false;
}

function missingMinimumGpa(
  requisites: CourseExtraction["requisites"],
  pageMarkdown: string,
) {
  const statesMinimumGpa =
    /\bminimum\s+(?:GPA(?:\s+of)?\s*[0-7](?:\.\d+)?|[0-7](?:\.\d+)?\s+GPA)\b|\bGPA\s+(?:of\s+)?at\s+least\s+[0-7](?:\.\d+)?\b/iu.test(
      pageMarkdown,
    );
  return (
    statesMinimumGpa &&
    !hasMinimumGpa(requisites.prerequisiteRule) &&
    !requisites.unmodelledText.some((wording) => /\bGPA\b/iu.test(wording))
  );
}

function hasAmbiguousCourseAlternatives(
  requisites: CourseExtraction["requisites"],
) {
  const wording = requisites.prerequisiteText;
  if (!wording || !requisites.prerequisiteRule) return false;
  const sequence =
    /\b[A-Z]{4}\d{4}\s+(and|or)\s+[A-Z]{4}\d{4}\s+(and|or)\s+[A-Z]{4}\d{4}\b/iu.exec(
      wording,
    );
  return sequence !== null && sequence[1] !== sequence[2];
}

/** A printed college-degree gate must not disappear behind a mode-specific permission. */
function missingCollegeEnrolment(
  rule: CourseRule | null,
  pageMarkdown: string,
) {
  const requisiteSection =
    pageMarkdown
      .split(/^## Requisite and Incompatibility\s*$/mu)[1]
      ?.split(/^## /mu)[0] ?? "";
  return (
    /\bmust be enrolled in (?:an? )?[A-Z]{2,} degree\b/u.test(
      requisiteSection,
    ) && !hasCollegeEnrolment(rule)
  );
}

/** Plain mixed conjunctions do not establish the scope of a prerequisite. */
function unscopedPrerequisiteClauses(
  pageMarkdown: string,
  rule: CourseRule | null,
): string[] {
  const section =
    pageMarkdown
      .split(/^## Requisite and Incompatibility\s*$/mu)[1]
      ?.split(/^## /mu)[0] ?? "";
  return section
    .split(/(?<=[.!?])\s+|\n\s*\n/u)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        /\b(?:completed|enrolled)\b/iu.test(sentence) &&
        /\band\b/iu.test(sentence) &&
        /\bor\b/iu.test(sentence) &&
        (sentence.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu)?.length ?? 0) >= 2 &&
        !/\beither\b|\bboth\b|[();]/iu.test(sentence) &&
        JSON.stringify(
          parsePlainCourseRequisites(sentence)?.prerequisiteRule,
        ) !== JSON.stringify(rule),
    );
}

/** Source-backed checks return review items and diagnostics without changing model rules. */
export function reviewCourseSourceRules({
  requisites,
  pageMarkdown,
}: {
  requisites: CourseExtraction["requisites"];
  pageMarkdown: string;
}): {
  reviewItems: CourseExtractionReviewItem[];
  unsupportedCollegeNames: string[];
  missingCollegeEnrolment: boolean;
  unscopedPrerequisiteClauses: string[];
} {
  const unscoped = requisites.prerequisiteRule
    ? unscopedPrerequisiteClauses(pageMarkdown, requisites.prerequisiteRule)
    : [];
  const collegeNames = [
    ...new Set([
      ...unsupportedCollegeNames(requisites.prerequisiteRule, pageMarkdown),
      ...unsupportedCollegeNames(requisites.corequisiteRule, pageMarkdown),
    ]),
  ];
  const missingCollege = missingCollegeEnrolment(
    requisites.prerequisiteRule,
    pageMarkdown,
  );
  const reviewItems: CourseExtractionReviewItem[] = collegeNames.map(
    (college) => ({
      fieldKey: "requisites",
      kind: "evidence_missing",
      severity: "error",
      message: `The ANU page does not contain the required college's name: ${college}. Preserve unresolved college eligibility for review.`,
    }),
  );
  if (missingCollege)
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "missing",
      severity: "error",
      message:
        "The ANU prerequisite requires enrolment in a college degree, but the modelled rule omits that eligibility. Review it before publication.",
    });
  if (missingMinimumGpa(requisites, pageMarkdown))
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "missing",
      severity: "error",
      message:
        "The ANU page states a minimum GPA, but the extracted prerequisites omit it. Check whether it gates an interview or enrolment before publishing.",
    });
  if (hasAmbiguousCourseAlternatives(requisites))
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "ambiguous",
      severity: "error",
      message:
        "The ANU prerequisite joins course codes with both 'and' and 'or' without grouping them. Confirm the intended alternatives before publishing.",
    });
  for (const clause of unscoped)
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "ambiguous",
      severity: "error",
      message: `The ANU prerequisite mixes AND/OR without explicit scope. The guessed rule was withheld for review: ${clause}`,
    });
  return {
    reviewItems,
    unsupportedCollegeNames: collegeNames,
    missingCollegeEnrolment: missingCollege,
    unscopedPrerequisiteClauses: unscoped,
  };
}
