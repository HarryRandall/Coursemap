import type { CatalogueSyncAdapter } from "../../../catalogue-sync/kind-adapter.ts";
import { structureCatalogueContent } from "../../../catalogue/content.ts";
import { convertAnuPageToMarkdown } from "../../anu-page-markdown.ts";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA,
  type AcademicStructureExtraction,
  type AcademicStructureKind,
  validateAcademicStructureExtraction,
} from "./contract.ts";
import { finaliseAcademicStructureExtraction } from "./finalise.ts";
import { normaliseAcademicStructureModelExtraction } from "./model-canonical.ts";
import { projectAcademicStructureSnapshot } from "./project.ts";
import {
  ACADEMIC_STRUCTURE_IMPORT_MAX_OUTPUT_TOKENS,
  ACADEMIC_STRUCTURE_IMPORT_PARSER_VERSION,
  ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
  ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  buildAcademicStructureExtractionSystemPrompt,
  buildAcademicStructureExtractionUserPrompt,
} from "./prompt.ts";
import { fetchAnuAcademicStructurePage } from "./source.ts";

function structureKind(kind: string): AcademicStructureKind {
  return kind as AcademicStructureKind;
}

export const structureKindAdapter: CatalogueSyncAdapter<AcademicStructureExtraction> =
  {
    kinds: ["programme", "major", "minor", "specialisation"],
    parserVersion: ACADEMIC_STRUCTURE_IMPORT_PARSER_VERSION,
    promptVersion: ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
    schemaVersion: ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
    schemaName: "academic_structure_extraction",
    maxOutputTokens: ACADEMIC_STRUCTURE_IMPORT_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: 150_000,
    extractionJsonSchema: ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA as Record<
      string,
      unknown
    >,
    async fetchSource(claim, { signal }) {
      return fetchAnuAcademicStructurePage(
        claim.academicYear,
        structureKind(claim.kind),
        claim.code,
        { signal },
      );
    },
    prepareInput(claim, page) {
      return convertAnuPageToMarkdown({
        html: page.html,
        frontMatter: {
          kind: claim.kind,
          code: claim.code,
          year: claim.academicYear,
          source_url: page.sourceUrl,
        },
      });
    },
    buildSystemPrompt: buildAcademicStructureExtractionSystemPrompt,
    buildUserPrompt(claim, pageMarkdown) {
      return buildAcademicStructureExtractionUserPrompt({
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        academicYear: claim.academicYear,
        pageMarkdown,
      });
    },
    validateModelOutput(claim, value) {
      const normalised = normaliseAcademicStructureModelExtraction(value);
      const result = validateAcademicStructureExtraction(normalised.value, {
        expectedKind: structureKind(claim.kind),
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
      return finaliseAcademicStructureExtraction({
        kind: structureKind(claim.kind),
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
      return structureCatalogueContent({
        projection: projectAcademicStructureSnapshot(extraction),
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
