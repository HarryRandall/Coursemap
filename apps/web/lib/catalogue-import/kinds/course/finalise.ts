import {
  COURSE_EXTRACTION_SCHEMA_VERSION,
  type CourseExtraction,
  type CourseExtractionReviewItem,
  validateCourseExtraction,
} from "./contract.ts";
import {
  canonicaliseCourseModelExtraction,
  courseModelCanonicalisationReviewItem,
} from "./model-canonical.ts";
import { unsupportedModelWording } from "../../model-evidence.ts";
import {
  modelResponseProblem,
  salvageModelExtraction,
  withModelEvidenceMethod,
} from "../../model-extraction.ts";

/** Identity the record already has; the model never supplies these. */
const COURSE_IDENTITY_FIELDS = [
  "schemaVersion",
  "code",
  "year",
  "level",
  "subjectCode",
] as const;

/**
 * A valid course extraction that states nothing about the course beyond its
 * identity, used for every field the model leaves out or gets wrong. The
 * title falls back to the directory listing so a record is never untitled.
 */
export function emptyCourseExtraction({
  code,
  year,
  title,
}: {
  code: string;
  year: number;
  title: string | null;
}): CourseExtraction {
  const normalisedCode = code.trim().toUpperCase();
  return {
    schemaVersion: COURSE_EXTRACTION_SCHEMA_VERSION,
    code: normalisedCode,
    year,
    title: title?.trim() || normalisedCode,
    unitValue: { kind: "unknown" },
    eftsl: null,
    level: Number(normalisedCode[4] ?? 0) * 1000,
    subjectCode: normalisedCode.slice(0, 4),
    subjectName: null,
    school: null,
    college: null,
    academicCareer: null,
    convenerText: null,
    deliverySummary: null,
    introduction: null,
    description: null,
    workloadText: null,
    workloadHours: null,
    inherentRequirements: null,
    prescribedTexts: null,
    offeringStatus: "unknown",
    sourceUpdatedAt: null,
    areasOfInterest: [],
    tags: [],
    fees: [],
    learningOutcomes: [],
    assessmentItems: [],
    offerings: [],
    requisites: {
      prerequisiteText: null,
      corequisiteText: null,
      incompatibilityText: null,
      prerequisiteRule: null,
      corequisiteRule: null,
      incompatibilityCourseCodes: [],
      softIncompatibilityCourseCodes: [],
      unmodelledText: [],
    },
    relatedCourses: [],
    attributes: [],
    evidence: [],
    overallConfidence: null,
    reviewItems: [],
  };
}

/**
 * Turns one model response into the course extraction that is stored. The
 * model owns every field. Whatever it returns that fits the contract is kept;
 * a field that does not is left empty with an error for review, and wording
 * the page does not carry is kept with a warning.
 */
export function finaliseCourseExtraction({
  code,
  year,
  listingTitle,
  model,
  pageMarkdown,
  finishReason,
  responseError,
}: {
  code: string;
  year: number;
  listingTitle: string | null;
  model: unknown;
  pageMarkdown: string;
  finishReason: string | null;
  responseError: string | null;
}) {
  const canonical = canonicaliseCourseModelExtraction(
    withModelEvidenceMethod(model),
    {
      expectedCode: code,
      expectedYear: year,
    },
  );
  const { extraction, dropped } = salvageModelExtraction({
    value: canonical.value,
    empty: emptyCourseExtraction({ code, year, title: listingTitle }),
    fixedKeys: COURSE_IDENTITY_FIELDS,
    validate: (candidate) =>
      validateCourseExtraction(candidate, {
        expectedCode: code,
        expectedYear: year,
      }),
  });

  const unsupported = unsupportedModelWording(extraction, pageMarkdown);
  const problem = modelResponseProblem({ finishReason, responseError });
  const canonicalised = courseModelCanonicalisationReviewItem(
    canonical.changes,
  );
  const reviewItems: CourseExtractionReviewItem[] = [
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
    ...(canonicalised ? [canonicalised] : []),
    ...dropped.map(({ fieldKey, messages }) => ({
      fieldKey,
      kind: "invalid" as const,
      severity: "error" as const,
      message:
        fieldKey === "modelExtraction"
          ? messages.join(" ")
          : `The model's ${fieldKey} did not fit the course contract and was left empty: ${messages[0]}`,
    })),
    ...unsupported.map(({ fieldKey, wording }) => ({
      fieldKey,
      kind: "evidence_missing" as const,
      severity: "warning" as const,
      message: `The ANU page does not contain this wording: ${wording.slice(0, 160)}`,
    })),
  ];
  const finalised: CourseExtraction = { ...extraction, reviewItems };
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
      canonicalisationChanges: canonical.changes,
      droppedFields: dropped,
      unsupportedWording: unsupported,
    },
  };
}
