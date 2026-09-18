import type { ClaimedImportTarget } from "./import-store.ts";
import type {
  CatalogueKind,
  CatalogueSnapshotWrite,
} from "./snapshot-write.ts";

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
};

/**
 * Everything kind-specific about an import: where the page lives, how it
 * becomes Markdown and model input, the deterministic parser, the model
 * contract and how a merged extraction becomes snapshot rows. The processor
 * owns stages, artefacts, leases and persistence.
 */
export type CatalogueKindAdapter<Extraction = unknown> = {
  kinds: readonly CatalogueKind[];
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  schemaName: string;
  maxOutputTokens: number;
  extractionJsonSchema: Record<string, unknown>;
  fetchSource(
    claim: ClaimedImportTarget,
    options: { signal?: AbortSignal },
  ): Promise<FetchedSourcePage>;
  /** Normalised Markdown for the audit trail and the trimmed model input. */
  prepareInput(
    claim: ClaimedImportTarget,
    page: FetchedSourcePage,
  ): { markdown: string; modelInput: string };
  buildSystemPrompt(): string;
  buildUserPrompt(claim: ClaimedImportTarget, modelInput: string): string;
  extractDeterministic(
    claim: ClaimedImportTarget,
    page: FetchedSourcePage,
  ): Extraction;
  /** Strict validation of raw model output against the extraction contract. */
  validateModelOutput(
    claim: ClaimedImportTarget,
    value: unknown,
  ): ValidationOutcome;
  merge(input: {
    claim: ClaimedImportTarget;
    deterministic: Extraction;
    model: unknown;
    modelValid: boolean;
    modelInput: string;
    responseError: string | null;
  }): MergeOutcome<Extraction>;
  project(extraction: Extraction): CatalogueSnapshotWrite;
};
