import type { AcademicStructureRequirements } from "./contract.ts";

const SMF_CODES = ["FINM3009", "FINM3010"] as const;

/** Keep the paired option and its timing outside automatic course-list credit. */
export function preservesStudentManagedFundChoice(
  requirements: AcademicStructureRequirements,
): boolean {
  let hasPairedChoice = false;
  let hasUnsafeCourseList = false;
  const visit = (rule: AcademicStructureRequirements["rule"]) => {
    if (!rule) return;
    if (rule.type === "group") {
      rule.children.forEach(visit);
      return;
    }
    if (rule.conditionKind === "free_text") {
      const wording = rule.freeText ?? rule.sourceText;
      if (SMF_CODES.every((code) => wording.includes(code)))
        hasPairedChoice = true;
    }
    if (
      rule.conditionKind === "course_list" &&
      !/\bList 1\b/iu.test(rule.sourceText) &&
      SMF_CODES.some((code) => rule.courseCodes.includes(code))
    )
      hasUnsafeCourseList = true;
  };
  visit(requirements.rule);
  return (
    hasPairedChoice &&
    !hasUnsafeCourseList &&
    requirements.unmodelledText.some((wording) =>
      /Student Managed Fund[\s\S]*consecutive semesters/iu.test(wording),
    )
  );
}
