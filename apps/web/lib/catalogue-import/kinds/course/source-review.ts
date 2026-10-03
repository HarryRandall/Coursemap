import { parsePlainCourseRequisites } from "./plain-requisites.ts";
import { unsupportedModelWording } from "../../model-evidence.ts";
import type {
  CourseExtraction,
  CourseExtractionReviewItem,
  CourseRule,
} from "./contract.ts";

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
