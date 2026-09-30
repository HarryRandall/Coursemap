import type {
  AcademicStructureExtractionReviewItem,
  AcademicStructureRequirementCondition,
  AcademicStructureRequirementRule,
  AcademicStructureRequirements,
} from "./contract.ts";

const CONSECUTIVE_SEMESTERS = /\bconsecutive\s+semesters?\b/iu;

function conditions(
  rule: AcademicStructureRequirementRule | null,
): AcademicStructureRequirementCondition[] {
  if (!rule) return [];
  return rule.type === "group" ? rule.children.flatMap(conditions) : [rule];
}

/**
 * Timing wording in the requirements must reach a measurable pair, and a
 * paired course must not also appear in an ordinary list where it could
 * count alone. Both are flagged for review rather than rewritten.
 */
export function consecutiveSemesterReviewItems(
  requirements: AcademicStructureRequirements,
): AcademicStructureExtractionReviewItem[] {
  const all = conditions(requirements.rule);
  const pairs = all.filter(
    (condition) => condition.conditionKind === "consecutive_semester_pair",
  );
  const items: AcademicStructureExtractionReviewItem[] = [];
  if (
    pairs.length === 0 &&
    CONSECUTIVE_SEMESTERS.test(requirements.sourceText ?? "")
  )
    items.push({
      fieldKey: "requirements.rule",
      kind: "ambiguous",
      severity: "error",
      message:
        "The requirements state a consecutive-semester timing, but no course pair models it. Review it before publication.",
    });
  const pairedCodes = new Set(pairs.flatMap(({ courseCodes }) => courseCodes));
  for (const condition of all) {
    if (condition.conditionKind !== "course_list") continue;
    const shared = condition.courseCodes.filter((code) =>
      pairedCodes.has(code),
    );
    if (shared.length > 0)
      items.push({
        fieldKey: "requirements.rule",
        kind: "conflict",
        severity: "error",
        message: `${shared.join(" and ")} must be taken as a consecutive-semester pair but also appear in a course list where one could count alone. Review it before publication.`,
      });
  }
  return items;
}
