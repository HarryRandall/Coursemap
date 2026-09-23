import type { CatalogueSyncAdapter } from "../../../catalogue-sync/kind-adapter.ts";
import { courseCatalogueContent } from "../../../catalogue/content.ts";
import { convertAnuPageToMarkdown } from "../../anu-page-markdown.ts";
import {
  COURSE_EXTRACTION_JSON_SCHEMA,
  type CourseExtraction,
  validateCourseExtraction,
} from "./contract.ts";
import { finaliseCourseExtraction } from "./finalise.ts";
import { canonicaliseCourseModelExtraction } from "./model-canonical.ts";
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
    return convertAnuPageToMarkdown({
      html: page.html,
      frontMatter: {
        kind: "course",
        code: claim.code,
        year: claim.academicYear,
        source_url: page.sourceUrl,
      },
    });
  },
  buildSystemPrompt: buildCourseExtractionSystemPrompt,
  buildUserPrompt(claim, pageMarkdown) {
    return buildCourseExtractionUserPrompt({
      expectedCode: claim.code,
      academicYear: claim.academicYear,
      pageMarkdown,
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
    });
    return {
      success: result.success,
      issues: result.success ? [] : result.issues,
    };
  },
  finalise({
    claim,
    listingTitle,
    model,
    pageMarkdown,
    finishReason,
    responseError,
  }) {
    return finaliseCourseExtraction({
      code: claim.code,
      year: claim.academicYear,
      listingTitle,
      model,
      pageMarkdown,
      finishReason,
      responseError,
    });
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
