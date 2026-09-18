import type { CatalogueKindAdapter } from "../../kind-adapter.ts";
import { structureSnapshotWrite } from "../../snapshot-write.ts";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA,
  type AcademicStructureExtraction,
  type AcademicStructureKind,
  validateAcademicStructureExtraction,
} from "./contract.ts";
import { extractDeterministicAcademicStructure } from "./deterministic.ts";
import {
  buildAcademicStructureModelInput,
  convertAcademicStructureHtmlToMarkdown,
} from "./markdown.ts";
import {
  academicStructureModelEvidenceIssues,
  mergeAcademicStructureExtractions,
  normaliseAcademicStructureModelExtraction,
} from "./merge.ts";
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

export const structureKindAdapter: CatalogueKindAdapter<AcademicStructureExtraction> =
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
      const result = convertAcademicStructureHtmlToMarkdown({
        html: page.html,
        kind: structureKind(claim.kind),
        code: claim.code,
        year: claim.academicYear,
        sourceUrl: page.sourceUrl,
      });
      return {
        markdown: result.markdown,
        modelInput: buildAcademicStructureModelInput(result).modelInput,
      };
    },
    buildSystemPrompt: buildAcademicStructureExtractionSystemPrompt,
    buildUserPrompt(claim, modelInput) {
      return buildAcademicStructureExtractionUserPrompt({
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        academicYear: claim.academicYear,
        modelInput,
      });
    },
    extractDeterministic(claim, page) {
      return extractDeterministicAcademicStructure({
        html: page.html,
        kind: structureKind(claim.kind),
        code: claim.code,
        year: claim.academicYear,
        sourceUrl: page.sourceUrl,
      });
    },
    validateModelOutput(claim, value) {
      const normalised = normaliseAcademicStructureModelExtraction(value);
      const result = validateAcademicStructureExtraction(normalised.value, {
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        expectedYear: claim.academicYear,
        evidenceMethod: "model",
      });
      return {
        success: result.success,
        issues: result.success ? [] : result.issues,
      };
    },
    merge({
      claim,
      deterministic,
      model,
      modelValid,
      modelInput,
      responseError,
    }) {
      const normalised = normaliseAcademicStructureModelExtraction(model);
      const validation = validateAcademicStructureExtraction(normalised.value, {
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        expectedYear: claim.academicYear,
        evidenceMethod: "model",
      });
      const evidenceIssues = validation.success
        ? academicStructureModelEvidenceIssues(validation.data, modelInput)
        : [];
      const usable =
        modelValid &&
        validation.success &&
        !responseError &&
        evidenceIssues.length === 0;
      const extraction = usable
        ? mergeAcademicStructureExtractions({
            deterministic,
            model: validation.data,
          })
        : deterministic;
      const warningCount = extraction.reviewItems.filter(
        ({ severity }) => severity === "warning",
      ).length;
      const errorCount = extraction.reviewItems.filter(
        ({ severity }) => severity === "error",
      ).length;
      return {
        extraction,
        modelValid: usable,
        warningCount,
        errorCount,
        report: {
          responseError,
          schemaValid: validation.success,
          schemaIssues: validation.success ? [] : validation.issues,
          evidenceValid: evidenceIssues.length === 0,
          evidenceIssues,
          providerNormalisations: normalised.normalisations,
          modelUsed: usable,
        },
      };
    },
    project(extraction) {
      return structureSnapshotWrite({
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
