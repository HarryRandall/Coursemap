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
  return ruleLeaves(rule).flatMap((leaf) =>
    leaf.op === "enrolled_in_college" &&
    unsupportedModelWording(
      { college: { sourceText: leaf.college } },
      pageMarkdown,
    ).length
      ? [leaf.college]
      : [],
  );
}

/** Every leaf, looking through groups and soft wrappers. */
export function ruleLeaves(rule: CourseRule | null): CourseRule[] {
  if (!rule) return [];
  if (rule.op === "all_of" || rule.op === "one_of")
    return rule.rules.flatMap(ruleLeaves);
  if (rule.op === "soft") return ruleLeaves(rule.rule);
  return [rule];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function pagePrints(pageMarkdown: string, token: string) {
  return new RegExp(
    `(?<![A-Za-z0-9-])${escapeRegExp(token)}(?![A-Za-z0-9])`,
    "u",
  ).test(pageMarkdown);
}

/**
 * Subject codes, levels, structure codes and programme titles in the newer
 * rule forms must be printed on the page. The model may not introduce a
 * filter or identity that the source does not state.
 */
function unprintedRuleValues(
  rules: readonly (CourseRule | null)[],
  pageMarkdown: string,
): string[] {
  const missing = new Set<string>();
  for (const leaf of rules.flatMap(ruleLeaves)) {
    if (
      leaf.op === "min_courses_matching" ||
      leaf.op === "min_units_matching"
    ) {
      for (const subject of leaf.subjectCodes ?? [])
        if (!pagePrints(pageMarkdown, subject)) missing.add(subject);
      for (const level of leaf.levels ?? [])
        if (!pagePrints(pageMarkdown, String(level)))
          missing.add(`${level} level`);
    } else if (leaf.op === "enrolled_in_structure") {
      if (!pagePrints(pageMarkdown, leaf.structureCode))
        missing.add(leaf.structureCode);
    } else if (leaf.op === "enrolled_in" && "programmeTitle" in leaf) {
      if (
        unsupportedModelWording(
          { programme: { sourceText: leaf.programmeTitle } },
          pageMarkdown,
        ).length
      )
        missing.add(leaf.programmeTitle);
    } else if (leaf.op === "minimum_gpa") {
      for (const code of [
        ...(leaf.subjectCodes ?? []),
        ...(leaf.courseCodes ?? []),
      ])
        if (!pagePrints(pageMarkdown, code)) missing.add(code);
      if (
        leaf.scopeText &&
        unsupportedModelWording(
          { scope: { sourceText: leaf.scopeText } },
          pageMarkdown,
        ).length
      )
        missing.add(leaf.scopeText);
    } else if (
      leaf.op === "enrolled_in_programme_family" ||
      leaf.op === "min_units_in_field"
    ) {
      const wording =
        leaf.op === "enrolled_in_programme_family" ? leaf.family : leaf.field;
      if (
        unsupportedModelWording(
          { value: { sourceText: wording } },
          pageMarkdown,
        ).length
      )
        missing.add(wording);
    } else if (leaf.op === "no_higher_course_in_subject") {
      // The subject is printed alone or as the prefix of a course code, such
      // as the page's own code.
      if (
        !pagePrints(pageMarkdown, leaf.subjectCode) &&
        !new RegExp(`\\b${leaf.subjectCode}\\d{4}`, "u").test(pageMarkdown)
      )
        missing.add(leaf.subjectCode);
    }
  }
  return [...missing];
}

function hasCollegeEnrolment(rule: CourseRule | null): boolean {
  return ruleLeaves(rule).some((leaf) => leaf.op === "enrolled_in_college");
}

function hasMinimumGpa(rule: CourseRule | null): boolean {
  return ruleLeaves(rule).some((leaf) => leaf.op === "minimum_gpa");
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

/**
 * A comma before the joining word separates the clauses when each part uses
 * only the other word: "A or B, and C or D" and "A and B, or C and D".
 */
function commaScoped(sentence: string) {
  const separatedBy = (join: "and" | "or", inner: "and" | "or") => {
    const parts = sentence.split(new RegExp(`,\\s*${join}\\b`, "iu"));
    return (
      parts.length > 1 &&
      parts.every((part) => !new RegExp(`\\b${inner}\\b`, "iu").test(part))
    );
  };
  return separatedBy("and", "and") || separatedBy("or", "or");
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
        !commaScoped(sentence) &&
        JSON.stringify(
          parsePlainCourseRequisites(sentence)?.prerequisiteRule,
        ) !== JSON.stringify(rule) &&
        // A soft requirement never blocks a student, so its scope cannot
        // make the rule stricter than the source.
        !ruleCoversClause([rule], sentence, { softOnly: true }),
    );
}

/** Lowercase words only, with Markdown links reduced to their text. */
function comparableWords(text: string) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Whether recorded wording is the clause, or contains most of it. */
function wordingCovers(wording: string, clause: string) {
  const recorded = comparableWords(wording);
  const target = comparableWords(clause);
  if (recorded.length < 12 || !target) return false;
  return (
    recorded.includes(target) ||
    (target.includes(recorded) && recorded.length >= target.length * 0.6)
  );
}

/** Every node of a rule, with whether a soft wrapper encloses it. */
function ruleNodes(
  rule: CourseRule | null,
  isSoft = false,
): Array<{ node: CourseRule; isSoft: boolean }> {
  if (!rule) return [];
  const here = { node: rule, isSoft: isSoft || rule.op === "note" };
  if (rule.op === "all_of" || rule.op === "one_of")
    return [here, ...rule.rules.flatMap((child) => ruleNodes(child, isSoft))];
  if (rule.op === "soft")
    return [{ node: rule, isSoft: true }, ...ruleNodes(rule.rule, true)];
  return [here];
}

function nodeWording(node: CourseRule): string | null {
  switch (node.op) {
    case "soft":
    case "permission":
      return node.sourceText ?? null;
    case "note":
    case "external_requirement":
    case "equivalent_course":
      return node.sourceText;
    default:
      return null;
  }
}

/**
 * Whether the modelled rules represent one printed eligibility clause: a
 * text-bearing condition records its wording, or the clause's plain reading
 * is part of the rule. With softOnly, only soft parts count, which is what
 * makes an unscoped AND/OR clause safe to keep.
 */
/** The course codes a leaf names, including a scoped average's courses. */
function leafCourseCodes(leaf: CourseRule): string[] {
  switch (leaf.op) {
    case "completed":
    case "completed_or_concurrent":
      return [leaf.courseCode];
    case "min_units_from_courses":
      return leaf.courseCodes;
    case "minimum_gpa":
      return leaf.courseCodes ?? [];
    default:
      return [];
  }
}

/**
 * A soft wrapper's sourceText is the exact clause it covers, which can be
 * shorter than the printed sentence ("assumes ... knowledge learnt in
 * MEDI8011"). Soft clauses taken from the sentence represent it when,
 * together, their rules name every course code the sentence prints. A
 * sentence without codes needs wording that covers it.
 */
function softClausesCoverCodes(
  nodes: ReadonlyArray<{ node: CourseRule; isSoft: boolean }>,
  clause: string,
) {
  const codes = [...new Set(clause.match(/\b[A-Z]{4}\d{4}[A-Z]?\b/gu) ?? [])];
  if (!codes.length) return false;
  const sentence = comparableWords(clause);
  const named = new Set(
    nodes.flatMap(({ node }) => {
      if (node.op !== "soft" || !node.sourceText) return [];
      const wording = comparableWords(node.sourceText);
      return wording && sentence.includes(wording)
        ? ruleLeaves(node.rule).flatMap(leafCourseCodes)
        : [];
    }),
  );
  return codes.every((code) => named.has(code));
}

export function ruleCoversClause(
  rules: readonly (CourseRule | null)[],
  clause: string,
  { softOnly = false }: { softOnly?: boolean } = {},
) {
  const nodes = rules
    .flatMap((rule) => ruleNodes(rule))
    .filter((entry) => !softOnly || entry.isSoft);
  if (
    nodes.some(({ node }) => {
      const wording = nodeWording(node);
      return wording !== null && wordingCovers(wording, clause);
    })
  )
    return true;
  if (softClausesCoverCodes(nodes, clause)) return true;
  const plain = parsePlainCourseRequisites(clause)?.prerequisiteRule;
  if (!plain) return false;
  const reading = JSON.stringify(plain);
  return nodes.some(
    ({ node }) =>
      JSON.stringify(node) === reading ||
      (node.op === "soft" && JSON.stringify(node.rule) === reading),
  );
}

/**
 * Eligibility wording found outside the requisite section raises an error
 * until a reader checks it. Once the modelled rules represent every flagged
 * clause, as a permission, a soft note or a rule that reads the same, the
 * error becomes a warning so the course is not held for wording it already
 * shows. Wording left in unmodelledText keeps its own error. An error that
 * stays keeps the clauses the rule does not represent as its source excerpt,
 * separated by blank lines. Mutates extraction.reviewItems and returns how
 * many errors were lifted.
 */
export function liftRepresentedEligibilityFlags(
  extraction: CourseExtraction,
  eligibilityClauses: ReadonlyArray<{ message: string; clauses: string[] }>,
) {
  const rules = [
    extraction.requisites.prerequisiteRule,
    extraction.requisites.corequisiteRule,
  ];
  let lifted = 0;
  for (const { message, clauses } of eligibilityClauses) {
    const uncovered = clauses.filter(
      (clause) => !ruleCoversClause(rules, clause),
    );
    if (uncovered.length) {
      const sourceExcerpt = [...new Set(uncovered)].join("\n\n");
      extraction.reviewItems = extraction.reviewItems.map((item) =>
        item.message === message && item.severity === "error"
          ? { ...item, sourceExcerpt }
          : item,
      );
      continue;
    }
    extraction.reviewItems = extraction.reviewItems.map((item) => {
      if (item.message !== message || item.severity !== "error") return item;
      lifted += 1;
      return {
        ...item,
        severity: "warning",
        message: `${message} The modelled rule represents it.`,
      };
    });
  }
  return lifted;
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
  unprintedRuleValues: string[];
} {
  const unprinted = unprintedRuleValues(
    [requisites.prerequisiteRule, requisites.corequisiteRule],
    pageMarkdown,
  );
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
  for (const value of unprinted)
    reviewItems.push({
      fieldKey: "requisites.prerequisiteRule",
      kind: "evidence_missing",
      severity: "error",
      message: `The ANU page does not print ${value}, which the modelled rule relies on. Review it before publication.`,
    });
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
    unprintedRuleValues: unprinted,
  };
}
