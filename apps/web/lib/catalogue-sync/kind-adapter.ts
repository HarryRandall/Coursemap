import type { ClaimedCatalogueSync } from "./sync-store.ts";
import type { CatalogueKind, CatalogueContent } from "../catalogue/content.ts";

export type FetchedSourcePage = {
  sourceUrl: string;
  canonicalUrl: string;
  html: string;
  contentSha256: string;
  byteSize: number;
  httpStatus: number;
  httpEtag: string | null;
  sourceLastModified: string | null;
  fetchedAt: string;
  /** A page that loaded but does not describe the expected record. */
  sourceError: (Error & { code: string; retryable: boolean }) | null;
};

export type ValidationOutcome = {
  success: boolean;
  issues: Array<{ path: string; message: string }>;
};

export type MergeOutcome<Extraction> = {
  extraction: Extraction;
  /** Whether the model output passed strict validation before merging. */
  modelValid: boolean;
  warningCount: number;
  errorCount: number;
  report: unknown;
  /**
   * Set when the model output was discarded. The processor records it on the
   * sync so a source version built from deterministic parsing alone says so.
   */
  errorCode?: string | null;
  /** The reason, for `catalogue_extractions.error_summary`. */
  errorSummary?: string | null;
};

/**
 * Everything kind-specific about a sync: where the page lives, how it
 * becomes Markdown and model input, the deterministic parser, the model
 * contract and how a merged extraction becomes version rows. The processor
 * owns stages, artefacts, leases and persistence.
 */
export type CatalogueSyncAdapter<Extraction = unknown> = {
  kinds: readonly CatalogueKind[];
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  schemaName: string;
  maxOutputTokens: number;
  /** Structure pages produce long outputs; each kind sets its own budget. */
  requestTimeoutMs: number;
  extractionJsonSchema: Record<string, unknown>;
  fetchSource(
    claim: ClaimedCatalogueSync,
    options: { signal?: AbortSignal },
  ): Promise<FetchedSourcePage>;
  /** Normalised Markdown for the audit trail and the trimmed model input. */
  prepareInput(
    claim: ClaimedCatalogueSync,
    page: FetchedSourcePage,
  ): { markdown: string; modelInput: string };
  buildSystemPrompt(): string;
  buildUserPrompt(claim: ClaimedCatalogueSync, modelInput: string): string;
  extractDeterministic(
    claim: ClaimedCatalogueSync,
    page: FetchedSourcePage,
  ): Extraction;
  /** Strict validation of raw model output against the extraction contract. */
  validateModelOutput(
    claim: ClaimedCatalogueSync,
    value: unknown,
  ): ValidationOutcome;
  merge(input: {
    claim: ClaimedCatalogueSync;
    deterministic: Extraction;
    model: unknown;
    modelValid: boolean;
    modelInput: string;
    responseError: string | null;
    /** The provider's stop reason; `length` means the response was truncated. */
    finishReason: string | null;
  }): MergeOutcome<Extraction>;
  project(extraction: Extraction): CatalogueContent;
};
