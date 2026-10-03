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
  hasExtractedContent,
  modelResponseProblem,
  rejectedModelValueSummary,
  salvageModelExtraction,
  withModelEvidenceMethod,
} from "../../model-extraction.ts";
import {
  type KnownProgramme,
  programmesMentionedOnPage,
} from "./programmes.ts";
import {
  reconcileBareIncompatibilities,
  reviewCourseSourceRules,
} from "./source-review.ts";

/** Known identity fields do not count as extracted course content. */
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
    workloadHoursBasis: null,
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
      assumedKnowledgeText: null,
      prerequisiteText: null,
      corequisiteText: null,
      incompatibilityText: null,
      prerequisiteRule: null,
      corequisiteRule: null,
      incompatibilityRule: null,
      incompatibilityCourseCodes: [],
      softIncompatibilityCourseCodes: [],
      concurrentIncompatibilityCourseCodes: [],
      softConcurrentIncompatibilityCourseCodes: [],
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
  knownProgrammes = [],
  knownPeriodCodes,
  knownTags,
}: {
  code: string;
  year: number;
  listingTitle: string | null;
  model: unknown;
  pageMarkdown: string;
  finishReason: string | null;
  responseError: string | null;
  knownProgrammes?: readonly KnownProgramme[];
  knownPeriodCodes?: readonly string[];
  knownTags?: readonly string[];
}) {
  const canonical = canonicaliseCourseModelExtraction(
    withModelEvidenceMethod(model),
    {
      expectedCode: code,
      expectedYear: year,
      knownProgrammes: programmesMentionedOnPage(pageMarkdown, knownProgrammes),
    },
  );
  const empty = emptyCourseExtraction({ code, year, title: listingTitle });
  const { extraction: extracted, dropped } = salvageModelExtraction({
    value: canonical.value,
    empty,
    // Validate the model's level before falling back to the known identity.
    // A rejected value remains an extraction error, so it cannot be published.
    fixedKeys: COURSE_IDENTITY_FIELDS.filter((key) => key !== "level"),
    optionalKeys: ["workloadHoursBasis"],
    validate: (candidate) =>
      validateCourseExtraction(candidate, {
        expectedCode: code,
        expectedYear: year,
        knownPeriodCodes,
        knownTags,
      }),
  });

  const incompatibilities = reconcileBareIncompatibilities({
    requisites: extracted.requisites,
    pageMarkdown,
  });
  const extraction: CourseExtraction = {
    ...extracted,
    requisites: incompatibilities.requisites,
  };

  const unsupported = unsupportedModelWording(extraction, pageMarkdown);
  const sourceReview = reviewCourseSourceRules({
    requisites: extraction.requisites,
    pageMarkdown,
  });
  if (sourceReview.unscopedPrerequisiteClauses.length) {
    extraction.requisites.prerequisiteRule = null;
    extraction.requisites.unmodelledText = [
      ...new Set([
        ...extraction.requisites.unmodelledText,
        ...sourceReview.unscopedPrerequisiteClauses,
      ]),
    ];
  }
  const problem = modelResponseProblem({ finishReason, responseError });
  const canonicalised = courseModelCanonicalisationReviewItem(
    canonical.changes,
  );
  const reviewItems: CourseExtractionReviewItem[] = [
    ...extraction.reviewItems,
    ...extraction.requisites.unmodelledText.map((wording) => ({
      fieldKey: "requisites.unmodelledText",
      kind: "unsupported" as const,
      severity: "error" as const,
      message: `The importer could not model this requirement: ${wording}`,
    })),
    ...sourceReview.reviewItems,
    ...incompatibilities.reviewItems,
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
    ...dropped.map(({ fieldKey, messages, value }) => ({
      fieldKey,
      kind: "invalid" as const,
      severity: "error" as const,
      message:
        fieldKey === "modelExtraction"
          ? messages.join(" ")
          : `The model's ${fieldKey} did not fit the course contract and was left empty: ${messages[0]}${rejectedModelValueSummary(value)}`,
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
    canPersist:
      !problem &&
      !dropped.some(({ fieldKey }) => fieldKey === "modelExtraction") &&
      hasExtractedContent(extraction, empty, COURSE_IDENTITY_FIELDS),
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
      unsupportedCollegeNames: sourceReview.unsupportedCollegeNames,
      missingCollegeEnrolment: sourceReview.missingCollegeEnrolment,
      unscopedPrerequisiteClauses: sourceReview.unscopedPrerequisiteClauses,
    },
  };
}
