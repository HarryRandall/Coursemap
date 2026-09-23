import {
  ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  type AcademicStructureExtraction,
  type AcademicStructureExtractionReviewItem,
  type AcademicStructureKind,
  validateAcademicStructureExtraction,
} from "./contract.ts";
import {
  ensureRequirementRootGroup,
  normaliseAcademicStructureModelExtraction,
  repairRequirementNodes,
} from "./model-canonical.ts";
import { unsupportedModelWording } from "../../model-evidence.ts";
import {
  modelResponseProblem,
  salvageModelExtraction,
  withModelEvidenceMethod,
} from "../../model-extraction.ts";

/** Identity the record already has; the model never supplies these. */
const STRUCTURE_IDENTITY_FIELDS = [
  "schemaVersion",
  "kind",
  "code",
  "year",
] as const;

/**
 * A valid structure extraction that states nothing beyond identity, used for
 * every field the model leaves out or gets wrong. The title falls back to the
 * directory listing so a record is never untitled.
 */
export function emptyAcademicStructureExtraction({
  kind,
  code,
  year,
  title,
}: {
  kind: AcademicStructureKind;
  code: string;
  year: number;
  title: string | null;
}): AcademicStructureExtraction {
  const normalisedCode = code.trim().toUpperCase();
  return {
    schemaVersion: ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
    kind,
    code: normalisedCode,
    year,
    title: title?.trim() || normalisedCode,
    acronym: null,
    shortName: null,
    introduction: null,
    description: null,
    totalUnits: null,
    durationYears: null,
    academicCareer: null,
    college: null,
    deliveryMode: null,
    selectionRank: null,
    atar: null,
    canCombine: null,
    canCombineVertical: null,
    studyAs: null,
    contactText: null,
    summaryFields: [],
    sections: [],
    learningOutcomes: [],
    fees: [],
    relationships: [],
    requirements: {
      sourceText: null,
      sourceLocator: null,
      rule: null,
      unmodelledText: [],
    },
    evidence: [],
    overallConfidence: null,
    reviewItems: [],
  };
}

/**
 * Turns one model response into the structure extraction that is stored. The
 * model owns every field. Whatever fits the contract is kept; a field that
 * does not is left empty with an error for review, and wording the page does
 * not carry is kept with a warning.
 */
export function finaliseAcademicStructureExtraction({
  kind,
  code,
  year,
  listingTitle,
  model,
  pageMarkdown,
  finishReason,
  responseError,
}: {
  kind: AcademicStructureKind;
  code: string;
  year: number;
  listingTitle: string | null;
  model: unknown;
  pageMarkdown: string;
  finishReason: string | null;
  responseError: string | null;
}) {
  const normalised = normaliseAcademicStructureModelExtraction(
    withModelEvidenceMethod(model),
  );
  const validate = (candidate: unknown) =>
    validateAcademicStructureExtraction(candidate, {
      expectedKind: kind,
      expectedCode: code,
      expectedYear: year,
    });
  // A malformed requirement branch becomes labelled text before salvage, so
  // it costs only that branch rather than the whole tree.
  let candidate = normalised.value;
  const repairedRequirements: string[] = [];
  for (let pass = 0; pass < 5; pass += 1) {
    const validation = validate(candidate);
    if (validation.success) break;
    const repair = repairRequirementNodes(
      candidate,
      validation.issues.map(({ path }) => path),
    );
    if (repair.repairedPaths.length === 0) break;
    candidate = repair.value;
    repairedRequirements.push(...repair.repairedPaths);
  }
  const { extraction, dropped } = salvageModelExtraction({
    value: candidate,
    empty: emptyAcademicStructureExtraction({
      kind,
      code,
      year,
      title: listingTitle,
    }),
    fixedKeys: STRUCTURE_IDENTITY_FIELDS,
    validate,
  });

  const unsupported = unsupportedModelWording(extraction, pageMarkdown);
  const problem = modelResponseProblem({ finishReason, responseError });
  const reviewItems: AcademicStructureExtractionReviewItem[] = [
    ...extraction.reviewItems,
    ...(problem
      ? [
          {
            fieldKey: "modelExtraction",
            kind: "invalid" as const,
            severity: "error" as const,
            message: problem,
          },
        ]
      : []),
    ...repairedRequirements.map((fieldKey) => ({
      fieldKey,
      kind: "ambiguous" as const,
      severity: "warning" as const,
      message:
        "The model's structure for this requirement did not fit the contract, so it is kept as the page's wording. Structure it in the requirement editor.",
    })),
    ...dropped.map(({ fieldKey, messages }) => ({
      fieldKey,
      kind: "invalid" as const,
      severity: "error" as const,
      message:
        fieldKey === "modelExtraction"
          ? messages.join(" ")
          : `The model's ${fieldKey} did not fit the ${kind} contract and was left empty: ${messages[0]}`,
    })),
    ...unsupported.map(({ fieldKey, wording }) => ({
      fieldKey,
      kind: "evidence_missing" as const,
      severity: "warning" as const,
      message: `The ANU page does not contain this wording: ${wording.slice(0, 160)}`,
    })),
  ];
  // The page often opens with a paragraph the model reads as both the
  // introduction and the description; printed twice it doubles the page.
  const description =
    extraction.introduction &&
    extraction.description?.localeCompare(extraction.introduction, undefined, {
      sensitivity: "accent",
    }) === 0
      ? null
      : extraction.description;
  const finalised: AcademicStructureExtraction = {
    ...extraction,
    description,
    requirements: ensureRequirementRootGroup(extraction.requirements),
    reviewItems,
  };
  return {
    extraction: finalised,
    warningCount: reviewItems.filter(({ severity }) => severity === "warning")
      .length,
    errorCount: reviewItems.filter(({ severity }) => severity === "error")
      .length,
    report: {
      finishReason,
      responseError,
      responseProblem: problem,
      providerNormalisations: normalised.normalisations,
      repairedRequirements,
      droppedFields: dropped,
      unsupportedWording: unsupported,
    },
  };
}
