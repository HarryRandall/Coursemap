/**
 * The information sections a structure page can carry, in reading order.
 * ANU names these differently from page to page ("Career Options",
 * "Employment Opportunities"); Coursemap files each under one meaning so
 * every major, minor, specialisation and programme reads the same way.
 * Requirements, learning outcomes, fees and related structures have fields of
 * their own and are never sections.
 */
export const STRUCTURE_SECTION_KEYS = [
  "study_options",
  "admission",
  "careers",
  "first_year_advice",
  "advice",
  "inherent_requirements",
  "fees_and_scholarships",
  "further_information",
  "contacts",
] as const;

export type StructureSectionKey = (typeof STRUCTURE_SECTION_KEYS)[number];

export const STRUCTURE_SECTION_LABELS: Record<StructureSectionKey, string> = {
  study_options: "Study options",
  admission: "Admission",
  careers: "Careers",
  first_year_advice: "First-year advice",
  advice: "Advice",
  inherent_requirements: "Inherent requirements",
  fees_and_scholarships: "Fees and scholarships",
  further_information: "More information",
  contacts: "Contacts",
};

export function isStructureSectionKey(
  value: unknown,
): value is StructureSectionKey {
  return STRUCTURE_SECTION_KEYS.some((key) => key === value);
}

/**
 * How another record relates to a structure. A programme's selectable
 * majors, minors and specialisations are options; the degrees a major,
 * minor or specialisation can be studied in are where it is offered. A
 * structure that must be taken alongside is a requirement, not a relationship.
 */
export const STRUCTURE_RELATIONSHIP_KINDS = [
  "offered_in",
  "option",
  "incompatible",
] as const;

export type StructureRelationshipKind =
  (typeof STRUCTURE_RELATIONSHIP_KINDS)[number];

export const STRUCTURE_RELATIONSHIP_LABELS: Record<
  StructureRelationshipKind,
  string
> = {
  offered_in: "Offered in",
  option: "Option",
  incompatible: "Cannot be combined with",
};

export function isStructureRelationshipKind(
  value: unknown,
): value is StructureRelationshipKind {
  return STRUCTURE_RELATIONSHIP_KINDS.some((kind) => kind === value);
}
