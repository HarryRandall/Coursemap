import type {
  AcademicStructureExtractionReviewItem,
  AcademicStructureRequirementCondition,
  AcademicStructureRequirementRule,
  AcademicStructureRequirements,
} from "./contract.ts";

const CONSECUTIVE_SEMESTERS = /\bconsecutive\s+semesters?\b/iu;
const COURSE_CODE = /\b[A-Z]{4}\d{4}[A-Z]?\b/gu;

/**
 * Course codes named in the sentences that state the timing. One code means
 * a single course taken over consecutive semesters, which no pair can model.
 */
function timingCourseCodes(sourceText: string) {
  const sentences = sourceText
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((sentence) => CONSECUTIVE_SEMESTERS.test(sentence));
  return new Set(
    sentences.flatMap((sentence) => sentence.match(COURSE_CODE) ?? []),
  );
}

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
/**
 * Timing that applies to repeating one course rather than to a pair: one
 * course is named, or every named course is already modelled as repeatable.
 */
function singleCourseTiming(
  sourceText: string,
  all: AcademicStructureRequirementCondition[],
) {
  const named = timingCourseCodes(sourceText);
  if (named.size === 1) return true;
  const repeatable = new Set(
    all.flatMap(({ repeatableCourses }) =>
      (repeatableCourses ?? []).map(({ courseCode }) => courseCode),
    ),
  );
  return named.size > 1 && [...named].every((code) => repeatable.has(code));
}

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
    CONSECUTIVE_SEMESTERS.test(requirements.sourceText ?? "") &&
    singleCourseTiming(requirements.sourceText ?? "", all)
  )
    items.push({
      fieldKey: "requirements.rule",
      kind: "unsupported",
      severity: "warning",
      message:
        "The requirements ask for a course to be repeated over consecutive semesters. Coursemap does not check that timing.",
    });
  else if (
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
