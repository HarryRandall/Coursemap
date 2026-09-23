import type {
  StructureRelationshipKind,
  StructureSectionKey,
} from "@/lib/catalogue/structure-vocabulary";
import type { CatalogueKind } from "@/lib/coursemap/catalogue-kinds";
import type { RequirementTreeGroup } from "@/lib/coursemap/requirement-tree-node";

export type StructureKind = Exclude<CatalogueKind, "course">;

export type StructureSection = {
  position: number;
  sectionKey: StructureSectionKey;
  heading: string;
  markdown: string;
};

export type StructureFee = {
  position: number;
  feeYear: number | null;
  audience: string;
  feeType: string;
  amount: number | null;
  currency: string | null;
  basis: string;
  sourceLabel: string | null;
  sourceText: string | null;
};

export type StructureRelationship = {
  position: number;
  relationshipKind: StructureRelationshipKind;
  targetKind: StructureKind;
  targetCode: string;
  targetTitle: string | null;
};

/**
 * One published academic structure as a reader sees it. The student page and
 * the administrator preview both render this, so a draft cannot look different
 * from what publishing it would produce.
 */
export type StructureDetails = {
  code: string;
  kind: StructureKind;
  year: number;
  name: string;
  acronym: string | null;
  shortName: string | null;
  introduction: string | null;
  description: string | null;
  units: number | null;
  durationYears: number | null;
  academicCareer: string | null;
  college: string | null;
  modeOfDelivery: string | null;
  selectionRank: number | null;
  atar: number | null;
  studyAs: string | null;
  contactText: string | null;
  sections: StructureSection[];
  learningOutcomes: Array<{ position: number; outcomeText: string }>;
  fees: StructureFee[];
  relationships: StructureRelationship[];
  requirements: RequirementTreeGroup | null;
};

/** Reader-facing names for the stored fee audiences and bases. */
export const STRUCTURE_FEE_AUDIENCE_LABELS: Record<string, string> = {
  domestic: "Domestic",
  international: "International",
  commonwealth_supported: "Commonwealth supported",
  other: "Other",
};

export const STRUCTURE_FEE_BASIS_LABELS: Record<string, string> = {
  programme: "per programme",
  unit: "per unit",
  eftsl: "per EFTSL",
  annual: "per year",
  unknown: "",
};

export const STRUCTURE_FEE_TYPE_LABELS: Record<string, string> = {
  student_contribution: "Student contribution",
  tuition: "Tuition",
  indicative: "Indicative fee",
  other: "Fee",
};
