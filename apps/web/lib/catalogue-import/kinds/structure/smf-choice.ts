import type { AcademicStructureRequirements } from "./contract.ts";

const SMF_CODES = ["FINM3009", "FINM3010"] as const;

/** The SMF route is a measurable pair only when its alternative and timing survive. */
export function preservesStudentManagedFundChoice(
  requirements: AcademicStructureRequirements,
): boolean {
  let hasPairedChoice = false;
  let hasUnsafeCourseList = false;
  const visit = (rule: AcademicStructureRequirements["rule"]) => {
    if (!rule) return;
    if (rule.type === "group") {
      if (rule.operator === "any_of") {
        const hasOrdinaryChoice = rule.children.some(
          (child) =>
            child.type === "condition" &&
            child.conditionKind === "course_list" &&
            child.minimumUnits === 12 &&
            !SMF_CODES.some((code) => child.courseCodes.includes(code)),
        );
        const hasTypedPair = rule.children.some(
          (child) =>
            child.type === "condition" &&
            child.conditionKind === "consecutive_semester_pair" &&
            child.minimumUnits === 12 &&
            child.courseCodes.length === 2 &&
            SMF_CODES.every(
              (code, index) => child.courseCodes[index] === code,
            ) &&
            SMF_CODES.every((code) => child.sourceText.includes(code)) &&
            /Student Managed Fund[\s\S]*consecutive semesters/iu.test(
              child.freeText ?? "",
            ),
        );
        if (hasOrdinaryChoice && hasTypedPair) hasPairedChoice = true;
      }
      rule.children.forEach(visit);
      return;
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
    !requirements.unmodelledText.some((wording) =>
      /Student Managed Fund[\s\S]*consecutive semesters/iu.test(wording),
    )
  );
}
