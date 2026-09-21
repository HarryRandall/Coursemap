import type { CatalogueContent } from "@/lib/catalogue/content";
import { requirementTreeFromSource } from "@/lib/coursemap/requirement-write-tree";
import {
  REQUIREMENT_SOURCE_SECTION_KEYS,
  type StructureDetails,
} from "@/lib/coursemap/structure-types";

/** The reader's view of a structure snapshot that has not been published yet. */
export function structureDetailsFromWrite(
  write: CatalogueContent,
): StructureDetails | null {
  if (write.kind === "course") return null;
  const structure = write.structure;
  const details = structure.details;
  const requirements = requirementTreeFromSource(
    write.requirements,
    "structure",
  );
  return {
    code: write.code,
    kind: write.kind,
    year: write.academicYear,
    name: details.name,
    acronym: details.acronym,
    shortName: details.shortName,
    introduction: details.introduction,
    description: details.description,
    units: details.units,
    durationYears: details.durationYears,
    academicCareer: details.academicCareer,
    college: details.college,
    modeOfDelivery: details.modeOfDelivery,
    selectionRank: details.selectionRank,
    atar: details.atar,
    studyAs: details.studyAs,
    contactText: details.contactText,
    sections: structure.sections
      .filter(
        (section) =>
          !requirements ||
          !REQUIREMENT_SOURCE_SECTION_KEYS.includes(section.sectionKey),
      )
      .map((section) => ({
        position: section.position,
        sectionKey: section.sectionKey,
        heading: section.heading,
        markdown: section.markdown,
      })),
    learningOutcomes: structure.learningOutcomes.map((outcome) => ({
      position: outcome.position,
      outcomeText: outcome.outcomeText,
    })),
    fees: structure.fees.map((fee) => ({
      position: fee.position,
      feeYear: fee.feeYear,
      audience: fee.audience,
      feeType: fee.feeType,
      amount: fee.amount,
      currency: fee.currency,
      basis: fee.basis,
      sourceLabel: fee.sourceLabel,
      sourceText: fee.sourceText,
    })),
    relationships: structure.relationships.map((relationship) => ({
      position: relationship.position,
      relationshipKind: relationship.relationshipKind,
      targetKind: relationship.targetKind,
      targetCode: relationship.targetCode,
      targetTitle: relationship.targetTitle,
    })),
    requirements,
  };
}
