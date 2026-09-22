import type { CatalogueSyncAdapter } from "../../../catalogue-sync/kind-adapter.ts";
import { courseCatalogueContent } from "../../../catalogue/content.ts";
import {
  COURSE_EXTRACTION_JSON_SCHEMA,
  type CourseExtraction,
  validateCourseExtraction,
} from "./contract.ts";
import { extractDeterministicCourse } from "./deterministic.ts";
import {
  buildCourseModelInput,
  convertCourseHtmlToMarkdown,
} from "./markdown.ts";
import { mergeCourseExtractions } from "./merge.ts";
import {
  canonicaliseCourseModelExtraction,
  courseModelCanonicalisationReviewItem,
} from "./model-canonical.ts";
import { projectCourseSnapshot } from "./project.ts";
import {
  COURSE_IMPORT_PARSER_VERSION,
  COURSE_IMPORT_PROMPT_VERSION,
  COURSE_SNAPSHOT_SCHEMA_VERSION,
  buildCourseExtractionSystemPrompt,
  buildCourseExtractionUserPrompt,
} from "./prompt.ts";
import { fetchAnuCoursePage } from "./source.ts";

export const courseKindAdapter: CatalogueSyncAdapter<CourseExtraction> = {
  kinds: ["course"],
  parserVersion: COURSE_IMPORT_PARSER_VERSION,
  promptVersion: COURSE_IMPORT_PROMPT_VERSION,
  schemaVersion: COURSE_SNAPSHOT_SCHEMA_VERSION,
  schemaName: "course_extraction",
  maxOutputTokens: 12_000,
  requestTimeoutMs: 35_000,
  extractionJsonSchema: COURSE_EXTRACTION_JSON_SCHEMA as Record<
    string,
    unknown
  >,
  async fetchSource(claim, { signal }) {
    return fetchAnuCoursePage(claim.academicYear, claim.code, { signal });
  },
  prepareInput(claim, page) {
    const { markdown } = convertCourseHtmlToMarkdown({
      html: page.html,
      courseCode: claim.code,
      year: claim.academicYear,
      sourceUrl: page.sourceUrl,
    });
    return {
      markdown,
      modelInput: buildCourseModelInput(markdown, claim.academicYear)
        .modelInput,
    };
  },
  buildSystemPrompt: buildCourseExtractionSystemPrompt,
  buildUserPrompt(claim, modelInput) {
    return buildCourseExtractionUserPrompt({
      expectedCode: claim.code,
      academicYear: claim.academicYear,
      modelInput,
    });
  },
  extractDeterministic(claim, page) {
    return extractDeterministicCourse({
      html: page.html,
      courseCode: claim.code,
      year: claim.academicYear,
      sourceUrl: page.sourceUrl,
    });
  },
  validateModelOutput(claim, value) {
    const canonical = canonicaliseCourseModelExtraction(value, {
      expectedCode: claim.code,
      expectedYear: claim.academicYear,
    });
    const result = validateCourseExtraction(canonical.value, {
      expectedCode: claim.code,
      expectedYear: claim.academicYear,
      evidenceMethod: "model",
    });
    return {
      success: result.success,
      issues: result.success ? [] : result.issues,
    };
  },
  merge({ claim, deterministic, model, modelValid, modelInput }) {
    const canonical = canonicaliseCourseModelExtraction(model, {
      expectedCode: claim.code,
      expectedYear: claim.academicYear,
    });
    const result = mergeCourseExtractions({
      deterministic,
      model: canonical.value,
      modelInput,
    });
    const canonicalisationReviewItem = courseModelCanonicalisationReviewItem(
      canonical.changes,
    );
    if (canonicalisationReviewItem) {
      result.extraction.reviewItems.push(canonicalisationReviewItem);
    }
    const warningCount = result.extraction.reviewItems.filter(
      ({ severity }) => severity === "warning",
    ).length;
    const errorCount = modelValid
      ? result.extraction.reviewItems.filter(
          ({ severity }) => severity === "error",
        ).length
      : result.modelValidationIssues.length;
    return {
      extraction: result.extraction,
      modelValid,
      warningCount,
      errorCount,
      errorCode: modelValid ? null : "MODEL_OUTPUT_REJECTED",
      errorSummary: modelValid
        ? null
        : "The model response failed the strict course extraction contract; only deterministic parsing reached this snapshot.",
      report: {
        schemaValid: modelValid,
        modelValidationIssues: result.modelValidationIssues,
        canonicalisationChanges: canonical.changes,
        conflicts: result.conflicts,
        evidenceIssues: result.evidenceIssues,
        modelAcceptedFields: result.modelAcceptedFields,
        modelRejectedFields: result.modelRejectedFields,
        reviewItems: result.extraction.reviewItems,
      },
    };
  },
  project(extraction) {
    return courseCatalogueContent({
      projection: projectCourseSnapshot(extraction),
      evidence: extraction.evidence.map((item) => ({
        fieldPath: item.fieldKey,
        method: item.method,
        confidence: item.confidence,
        sourceLocator: item.sourceLocator,
        sourceExcerpt: item.evidenceExcerpt,
      })),
      flags: extraction.reviewItems.map((item) => ({
        fieldPath: item.fieldKey,
        severity: item.severity,
        code: item.kind.toUpperCase(),
        message: item.message,
        sourceExcerpt: null,
      })),
    });
  },
};
