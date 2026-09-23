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

export type FinaliseOutcome<Extraction> = {
  extraction: Extraction;
  warningCount: number;
  errorCount: number;
  report: unknown;
};

/**
 * Everything kind-specific about a sync: where the page lives, how it becomes
 * model input, the model contract and how the finalised extraction becomes
 * version rows. The model owns every field of the extraction; the processor
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
  /** The whole page as Markdown, which is also the model input. */
  prepareInput(claim: ClaimedCatalogueSync, page: FetchedSourcePage): string;
  buildSystemPrompt(): string;
  buildUserPrompt(claim: ClaimedCatalogueSync, pageMarkdown: string): string;
  /** Strict validation of raw model output, recorded for the audit trail. */
  validateModelOutput(
    claim: ClaimedCatalogueSync,
    value: unknown,
  ): ValidationOutcome;
  /**
   * The stored extraction: every part of the response that fits the contract,
   * with review items for what did not and for wording the page lacks.
   */
  finalise(input: {
    claim: ClaimedCatalogueSync;
    /** The directory title, used only when the model gives none. */
    listingTitle: string | null;
    model: unknown;
    pageMarkdown: string;
    responseError: string | null;
    /** The provider's stop reason; `length` means the response was truncated. */
    finishReason: string | null;
  }): FinaliseOutcome<Extraction>;
  project(extraction: Extraction): CatalogueContent;
};
