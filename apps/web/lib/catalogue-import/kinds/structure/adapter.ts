import type {
  CatalogueSyncAdapter,
  SupportingSourcePage,
} from "../../../catalogue-sync/kind-adapter.ts";
import { load } from "cheerio";
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
import { preservesStudentManagedFundChoice } from "./smf-choice.ts";
import {
  fetchCbeListOneMembership,
  modelsCbeListOneMembership,
} from "./cbe-list-one.ts";

function structureKind(kind: string): AcademicStructureKind {
  return kind as AcademicStructureKind;
}

function linksToCbeListOne(html: string) {
  const $ = load(html);
  return $("a[href]")
    .toArray()
    .some((link) => {
      const label = $(link).text().replace(/\s+/gu, " ").trim();
      if (!/\bList 1\b/iu.test(label)) return false;
      try {
        const url = new URL(
          $(link).attr("href") ?? "",
          "https://programsandcourses.anu.edu.au",
        );
        return (
          url.origin === "https://cbe.anu.edu.au" &&
          /\/list-1\/?/iu.test(url.pathname)
        );
      } catch {
        return false;
      }
    });
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
      const page = await fetchAnuAcademicStructurePage(
        claim.academicYear,
        structureKind(claim.kind),
        claim.code,
        { signal },
      );
      if (
        page.sourceError ||
        claim.kind !== "programme" ||
        claim.code !== "BFINN" ||
        claim.academicYear !== 2024 ||
        !linksToCbeListOne(page.html)
      )
        return page;
      const list = await fetchCbeListOneMembership({ signal });
      const supporting: SupportingSourcePage = {
        ...list,
        sourceName: "ANU College of Business and Economics List 1",
        sourceKind: "linked_course_list",
        sourceBaseUrl: "https://cbe.anu.edu.au",
        externalKey: "CBE-LIST-1-2024",
        httpStatus: 200,
      };
      return { ...page, supportingSources: [supporting] };
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
    buildUserPrompt(claim, pageMarkdown, _context, supportingSources) {
      return buildAcademicStructureExtractionUserPrompt({
        expectedKind: structureKind(claim.kind),
        expectedCode: claim.code,
        academicYear: claim.academicYear,
        pageMarkdown,
        supportingSources,
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
      supportingSources,
    }) {
      const outcome = finaliseAcademicStructureExtraction({
        kind: structureKind(claim.kind),
        code: claim.code,
        year: claim.academicYear,
        listingTitle,
        model,
        pageMarkdown,
        finishReason,
        responseError,
      });
      const incompleteList = supportingSources?.some(
        (source) =>
          !modelsCbeListOneMembership(
            outcome.extraction.requirements.rule,
            source.courseCodes,
          ),
      );
      const mismatchedCourseLinks = (supportingSources ?? []).flatMap(
        (source) => source.mismatchedCourseLinks,
      );
      const unsafeSmfChoice =
        claim.kind === "programme" &&
        claim.code === "BFINN" &&
        claim.academicYear === 2024 &&
        /FINM3009[\s\S]*FINM3010[\s\S]*consecutive semesters/iu.test(
          pageMarkdown,
        ) &&
        !preservesStudentManagedFundChoice(outcome.extraction.requirements);
      if (
        !incompleteList &&
        !unsafeSmfChoice &&
        mismatchedCourseLinks.length === 0
      )
        return outcome;
      return {
        ...outcome,
        extraction: {
          ...outcome.extraction,
          reviewItems: [
            ...outcome.extraction.reviewItems,
            ...(incompleteList
              ? [
                  {
                    fieldKey: "requirements.rule",
                    kind: "invalid" as const,
                    severity: "error" as const,
                    message:
                      "The linked List 1 requirement does not contain the full verified 2024 course membership. Review it before publication.",
                  },
                ]
              : []),
            ...(unsafeSmfChoice
              ? [
                  {
                    fieldKey: "requirements.rule",
                    kind: "invalid" as const,
                    severity: "error" as const,
                    message:
                      "The Student Managed Fund option must retain the ordered courses and timing in a consecutive-semester pair. Review it before publication.",
                  },
                ]
              : []),
            ...mismatchedCourseLinks.map(({ listedCode, linkedCode }) => ({
              fieldKey: "requirements.rule",
              kind: "conflict" as const,
              severity: "error" as const,
              message: `The linked CBE List 1 prints ${listedCode} but its ANU course link points to ${linkedCode}. Resolve the source discrepancy before publication.`,
            })),
          ],
        },
        errorCount:
          outcome.errorCount +
          Number(Boolean(incompleteList)) +
          Number(unsafeSmfChoice) +
          mismatchedCourseLinks.length,
      };
    },
    project(extraction, supportingSources) {
      return structureCatalogueContent({
        projection: projectAcademicStructureSnapshot(extraction),
        evidence: [
          ...extraction.evidence.map((item) => ({
            fieldPath: item.fieldKey,
            method: item.method,
            confidence: item.confidence,
            sourceLocator: item.sourceLocator,
            sourceExcerpt: item.evidenceExcerpt,
          })),
          ...(supportingSources ?? []).map((source) => ({
            fieldPath: "requirements.structure",
            method: "deterministic" as const,
            confidence: 1,
            sourceLocator: source.sourceUrl,
            sourceExcerpt: "List 1: CBE Courses 2024 and 2023",
            sourceUrl: source.sourceUrl,
          })),
        ],
        flags: [
          ...extraction.reviewItems.map((item) => ({
            fieldPath: item.fieldKey,
            severity: item.severity,
            code: item.kind.toUpperCase(),
            message: item.message,
            sourceExcerpt: null,
          })),
          ...(supportingSources ?? []).flatMap((source) =>
            source.duplicateCodes.length
              ? [
                  {
                    fieldPath: "requirements.structure",
                    severity: "warning" as const,
                    code: "SOURCE_DUPLICATE_COURSE",
                    message: `The linked course list repeats ${source.duplicateCodes.join(", ")}; each code was supplied once for review.`,
                    sourceExcerpt: null,
                  },
                ]
              : [],
          ),
        ],
      });
    },
  };
