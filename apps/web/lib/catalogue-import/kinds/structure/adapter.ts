import type { CatalogueKindAdapter } from "../../kind-adapter.ts";
import { structureCatalogueContent } from "../../../catalogue/content.ts";
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
  ACADEMIC_STRUCTURE_MODEL_FIELDS,
  academicStructureModelEvidenceIssues,
  academicStructureModelFieldRoot,
  mergeAcademicStructureExtractions,
  normaliseAcademicStructureModelExtraction,
} from "./merge.ts";
import { academicStructureModelResponseError } from "./model-response-error.ts";
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
      finishReason,
    }) {
      const normalised = normaliseAcademicStructureModelExtraction(model);
      const validation = validateAcademicStructureExtraction(normalised.value, {
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        expectedYear: claim.academicYear,
        evidenceMethod: "model",
      });
      // A truncated response reads as a cause rather than a bare finish
      // reason, and travels to catalogue_extractions.error_summary.
      const responseCause = academicStructureModelResponseError({
        finishReason,
        responseError,
      });
      const evidenceIssues = validation.success
        ? academicStructureModelEvidenceIssues(validation.data, modelInput)
        : [];
      // A response that did not finish, or that failed the contract, carries
      // no field worth trusting. Anything else is judged field by field: one
      // unsupported fee no longer costs the requirement tree, which matters
      // because the deterministic fallback models that tree as a single
      // free-text condition.
      const discarded = !modelValid || !validation.success || !!responseCause;
      const modelFields = ACADEMIC_STRUCTURE_MODEL_FIELDS as readonly string[];
      const rejectedFields = new Set<string>(
        discarded
          ? modelFields
          : evidenceIssues
              .map(({ fieldKey }) => academicStructureModelFieldRoot(fieldKey))
              .filter((field) => modelFields.includes(field)),
      );
      const extraction =
        discarded || !validation.success
          ? structuredClone(deterministic)
          : mergeAcademicStructureExtractions({
              deterministic,
              model: validation.data,
              rejectedFields,
            });

      if (discarded) {
        extraction.reviewItems.push({
          fieldKey: "modelExtraction",
          kind: "invalid",
          severity: "error",
          message:
            responseCause ??
            "The model response failed the strict academic structure extraction contract; only deterministic parsing reached this snapshot.",
        });
      } else {
        for (const field of rejectedFields) {
          extraction.reviewItems.push({
            fieldKey: field,
            kind: "evidence_missing",
            severity: "warning",
            message: `The model supplied ${field} without wording from the selected-year source; the deterministic value was kept.`,
          });
        }
      }
      const warningCount = extraction.reviewItems.filter(
        ({ severity }) => severity === "warning",
      ).length;
      const errorCount = extraction.reviewItems.filter(
        ({ severity }) => severity === "error",
      ).length;
      return {
        extraction,
        modelValid: !discarded,
        warningCount,
        errorCount,
        errorCode: discarded ? "MODEL_OUTPUT_REJECTED" : null,
        errorSummary: discarded
          ? (responseCause ??
            "The model response failed strict extraction validation; deterministic data was retained.")
          : null,
        report: {
          responseError,
          responseCause,
          finishReason,
          schemaValid: validation.success,
          schemaIssues: validation.success ? [] : validation.issues,
          evidenceValid: evidenceIssues.length === 0,
          evidenceIssues,
          providerNormalisations: normalised.normalisations,
          modelUsed: !discarded,
          modelRejectedFields: [...rejectedFields].sort(),
          modelAcceptedFields: discarded
            ? []
            : modelFields.filter((field) => !rejectedFields.has(field)),
        },
      };
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
