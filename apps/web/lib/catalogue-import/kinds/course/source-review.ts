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
} {
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
  return {
    reviewItems,
    unsupportedCollegeNames: collegeNames,
    missingCollegeEnrolment: missingCollege,
  };
}
