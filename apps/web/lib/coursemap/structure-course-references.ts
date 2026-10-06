import { requirementCourseCodes } from "@/lib/coursemap/requirement-display";
import type { StructureDetails } from "@/lib/coursemap/structure-types";

/** Includes prose references for display without turning advice into requirements. */
export function structureCourseReferenceCodes(
  structure: StructureDetails,
): string[] {
  const prose = [
    structure.introduction,
    structure.description,
    ...structure.sections.map((section) => section.markdown),
  ];
  return [
    ...new Set([
      ...requirementCourseCodes(structure.requirements),
      ...prose.flatMap((text) => text?.match(/[A-Z]{4}\d{4}[A-Z]?/gu) ?? []),
    ]),
  ];
}
