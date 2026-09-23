import { randomUUID } from "node:crypto";
import {
  SyncArtifactConfigurationError,
  type SyncArtifactKind,
  readSyncArtifact,
  storeSyncArtifact,
} from "./artifact-store.ts";
import {
  stableFingerprint,
  stableStringify,
} from "../catalogue-import/canonical.ts";
import {
  type ClaimedCatalogueSync,
  type SyncSql,
  type SyncStageName,
  attachExtractionResponse,
  claimCatalogueSync,
  completeExtraction,
  failSyncStage,
  findReusableExtraction,
  finishCatalogueSync,
  finishSyncStage,
  getCatalogueSyncStatus,
  readListingTitle,
  recordSourceDocument,
  recordSyncArtifact,
  releaseCatalogueSyncForRetry,
  reserveExtraction,
  startSyncStage,
  withSyncDatabaseClient,
} from "./sync-store.ts";
import type { CatalogueSyncAdapter } from "./kind-adapter.ts";
import { courseKindAdapter } from "../catalogue-import/kinds/course/adapter.ts";
import { structureKindAdapter } from "../catalogue-import/kinds/structure/adapter.ts";
import {
  OpenRouterConfigurationError,
  OpenRouterRequestError,
  buildOpenRouterRequestBody,
  extractWithOpenRouter,
  restoreOpenRouterExtraction,
} from "../catalogue-import/openrouter.ts";
import { persistSourceVersion } from "./persist-source-version.ts";
import type { CatalogueKind } from "../catalogue/content.ts";

const TERMINAL_SYNC_STATUSES = new Set([
  "applied",
  "review_required",
  "unchanged",
  "failed",
  "cancelled",
]);

export const CATALOGUE_SYNC_ADAPTERS: readonly CatalogueSyncAdapter[] = [
  courseKindAdapter as CatalogueSyncAdapter,
  structureKindAdapter as CatalogueSyncAdapter,
];

export function syncAdapterForKind(kind: CatalogueKind): CatalogueSyncAdapter {
  const adapter = CATALOGUE_SYNC_ADAPTERS.find((candidate) =>
    candidate.kinds.includes(kind),
  );
  if (!adapter)
    throw new TypeError(`No catalogue sync adapter handles ${kind}.`);
  return adapter;
}

export class SyncPaidOutcomeUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "An OpenRouter request may have reached the provider, but its response was not durably recorded. Coursemap will not issue an automatic second paid call.",
      { cause },
    );
    this.name = "SyncPaidOutcomeUncertainError";
  }
}

export class SyncVersionMismatchError extends TypeError {
  readonly code = "SYNC_VERSION_UNSUPPORTED";

  constructor() {
    super(
      "The queued sync was created for a different pipeline version. Start a new sync with the deployed worker.",
    );
    this.name = "SyncVersionMismatchError";
  }
}

function assertCurrentVersions(
  adapter: CatalogueSyncAdapter,
  claim: ClaimedCatalogueSync,
) {
  if (
    claim.parserVersion !== adapter.parserVersion ||
    claim.promptVersion !== adapter.promptVersion ||
    claim.schemaVersion !== adapter.schemaVersion
  ) {
    throw new SyncVersionMismatchError();
  }
}

export function safeErrorSummary(error: unknown) {
  // The cause matters most for uncertain outcomes, where the wrapper message
  // alone says nothing about what went wrong.
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? ` Cause: ${error.cause.message}`
      : "";
  const source =
    (error instanceof Error ? error.message : "Catalogue sync failed.") + cause;
  return source
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database URL redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[OpenRouter key redacted]")
    .slice(0, 1_500);
}

export function syncErrorCode(error: unknown) {
  if (error instanceof SyncPaidOutcomeUncertainError)
    return "OPENROUTER_OUTCOME_UNCERTAIN";
  if (error instanceof OpenRouterConfigurationError)
    return "OPENROUTER_NOT_CONFIGURED";
  if (error instanceof OpenRouterRequestError)
    return `OPENROUTER_HTTP_${error.status}`;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim()
  ) {
    return error.code.trim().slice(0, 120);
  }
  return error instanceof TypeError ? "INVALID_PIPELINE_DATA" : "SYNC_FAILED";
}

export function isRetryableSyncError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return error.retryable;
  }
  // A definitive HTTP failure is safe to report, but retrying the same sync
  // would be misread as an uncertain paid outcome by the reservation check.
  if (error instanceof OpenRouterRequestError) return false;
  // Constraint and data errors from Postgres repeat identically on retry.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^(22|23|42)/.test(error.code)
  ) {
    return false;
  }
  if (
    error instanceof OpenRouterConfigurationError ||
    error instanceof SyncPaidOutcomeUncertainError ||
    error instanceof SyncArtifactConfigurationError ||
    error instanceof TypeError
  ) {
    return false;
  }
  return true;
}

export type ProcessCatalogueSyncInput = {
  syncId: string;
  deliveryCount?: number;
  maxDeliveries?: number;
  signal?: AbortSignal;
};

/**
 * Processes one sync end to end under a worker lease. Retryable failures
 * return it to the queue until the final delivery; everything else records a
 * failed sync so the queue can acknowledge the message.
 */
export async function processCatalogueSync({
  syncId,
  deliveryCount = 1,
  maxDeliveries = 5,
  signal,
}: ProcessCatalogueSyncInput): Promise<void> {
  await withSyncDatabaseClient(async (sql) => {
    signal?.throwIfAborted();
    const workerId = randomUUID();
    const claim = await claimCatalogueSync(sql, { syncId, workerId });
    if (claim === null) {
      const status = await getCatalogueSyncStatus(sql, syncId);
      if (status && TERMINAL_SYNC_STATUSES.has(status)) return;
      throw new Error("The catalogue sync could not be claimed.");
    }
    await processClaimedSync({
      sql,
      claim,
      workerId,
      finalDelivery: deliveryCount >= maxDeliveries,
      signal,
    });
  });
}

async function processClaimedSync({
  sql,
  claim,
  workerId,
  finalDelivery,
  signal,
}: {
  sql: SyncSql;
  claim: ClaimedCatalogueSync;
  workerId: string;
  finalDelivery: boolean;
  signal?: AbortSignal;
}) {
  const adapter = syncAdapterForKind(claim.kind);
  let sourceDocumentId: number | null = null;

  const runStage = async <T>(
    stageName: SyncStageName,
    work: (stageId: string) => Promise<T>,
  ) => {
    signal?.throwIfAborted();
    const stageId = await startSyncStage(sql, {
      syncId: claim.syncId,
      stageName,
      attemptNumber: claim.attemptCount,
    });
    try {
      const value = await work(stageId);
      signal?.throwIfAborted();
      await finishSyncStage(sql, stageId);
      return value;
    } catch (error) {
      await failSyncStage(sql, {
        stageId,
        errorCode: syncErrorCode(error),
        errorSummary: safeErrorSummary(error),
      });
      throw error;
    }
  };

  const persistArtifact = async ({
    stageId,
    stageName,
    kind,
    mediaType,
    body,
  }: {
    stageId: string;
    stageName: SyncStageName;
    kind: SyncArtifactKind;
    mediaType: string;
    body: string;
  }) => {
    signal?.throwIfAborted();
    const stored = await storeSyncArtifact({
      academicYear: claim.academicYear,
      syncId: claim.syncId,
      stage: stageName,
      kind,
      mediaType,
      body,
    });
    return recordSyncArtifact(sql, {
      syncId: claim.syncId,
      stageId,
      kind,
      attemptNumber: claim.attemptCount,
      mediaType: stored.mediaType,
      contentSha256: stored.contentSha256,
      byteSize: stored.byteSize,
      storageBucket: stored.bucket,
      storagePath: stored.path,
    });
  };

  try {
    assertCurrentVersions(adapter, claim);

    const page = await runStage("source_fetch", () =>
      adapter.fetchSource(claim, { signal }),
    );

    await runStage("html_capture", async (stageId) => {
      const raw = await persistArtifact({
        stageId,
        stageName: "html_capture",
        kind: "raw_html",
        mediaType: "text/html",
        body: page.html,
      });
      sourceDocumentId = await recordSourceDocument(sql, {
        sourceId: claim.sourceId,
        recordId: claim.recordId,
        academicYearId: claim.academicYearId,
        kind: claim.kind,
        externalKey: claim.code,
        canonicalUrl: page.canonicalUrl,
        contentSha256: page.contentSha256,
        httpStatus: page.httpStatus,
        httpEtag: page.httpEtag,
        sourceLastModified: page.sourceLastModified,
        fetchedAt: page.fetchedAt,
        byteSize: page.byteSize,
        storageBucket: raw.bucket,
        storagePath: raw.path,
      });
      if (page.sourceError) throw page.sourceError;
    });

    const pageMarkdown = await runStage(
      "markdown_normalise",
      async (stageId) => {
        const markdown = adapter.prepareInput(claim, page);
        await persistArtifact({
          stageId,
          stageName: "markdown_normalise",
          kind: "normalised_markdown",
          mediaType: "text/markdown",
          body: markdown,
        });
        return markdown;
      },
    );

    const userPrompt = await runStage(
      "model_input_prepare",
      async (stageId) => {
        const prompt = adapter.buildUserPrompt(claim, pageMarkdown);
        await persistArtifact({
          stageId,
          stageName: "model_input_prepare",
          kind: "model_input",
          mediaType: "text/plain",
          body: prompt,
        });
        return prompt;
      },
    );

    const systemPrompt = adapter.buildSystemPrompt();
    const requestBody = buildOpenRouterRequestBody({
      model: claim.requestedModel,
      systemPrompt,
      modelInput: userPrompt,
      schema: adapter.extractionJsonSchema,
      schemaName: adapter.schemaName,
      maxOutputTokens: adapter.maxOutputTokens,
    });
    const fingerprint = stableFingerprint({
      sourceContentSha256: page.contentSha256,
      parserVersion: claim.parserVersion,
      promptVersion: claim.promptVersion,
      schemaVersion: claim.schemaVersion,
      requestBody,
    });

    const modelResult = await runStage("model_extract", async (stageId) => {
      const requestArtifact = await persistArtifact({
        stageId,
        stageName: "model_extract",
        kind: "model_request",
        mediaType: "application/json",
        body: stableStringify(requestBody),
      });
      const reservation = await reserveExtraction(sql, {
        syncId: claim.syncId,
        extractionNumber: claim.attemptCount,
        requestedModel: claim.requestedModel,
        fingerprint,
        promptVersion: claim.promptVersion,
        schemaVersion: claim.schemaVersion,
        requestArtifactId: requestArtifact.id,
      });
      const reusable = await findReusableExtraction(sql, fingerprint);

      let result;
      let responseArtifactId: string;
      let reusedFromExtractionId: string | null = null;

      if (reusable) {
        // Identical input already produced a validated response; reuse it
        // instead of paying for another call.
        const body = await readSyncArtifact({
          artifact: reusable.responseArtifact,
        });
        result = restoreOpenRouterExtraction(
          JSON.parse(body) as unknown,
          claim.requestedModel,
        );
        const responseArtifact = await persistArtifact({
          stageId,
          stageName: "model_extract",
          kind: "model_response",
          mediaType: "application/json",
          body: stableStringify(result.responseForAudit),
        });
        responseArtifactId = responseArtifact.id;
        reusedFromExtractionId =
          reusable.id === reservation.id ? null : reusable.id;
      } else if (!reservation.created) {
        if (!reservation.responseArtifactId) {
          throw new SyncPaidOutcomeUncertainError(null);
        }
        responseArtifactId = reservation.responseArtifactId;
        const [artifact] = await sql`
          select media_type, content_sha256, byte_size, storage_bucket, storage_path
          from public.catalogue_sync_artifacts where id = ${responseArtifactId}::uuid
        `;
        const body = await readSyncArtifact({
          artifact: {
            bucket: artifact.storage_bucket,
            path: String(artifact.storage_path),
            mediaType: String(artifact.media_type),
            contentSha256: String(artifact.content_sha256),
            byteSize: Number(artifact.byte_size),
          },
        });
        result = restoreOpenRouterExtraction(
          JSON.parse(body) as unknown,
          claim.requestedModel,
        );
      } else {
        try {
          result = await extractWithOpenRouter({
            model: claim.requestedModel,
            systemPrompt,
            modelInput: userPrompt,
            schema: adapter.extractionJsonSchema,
            schemaName: adapter.schemaName,
            maxOutputTokens: adapter.maxOutputTokens,
            requestTimeoutMs: adapter.requestTimeoutMs,
            signal,
          });
          const responseArtifact = await persistArtifact({
            stageId,
            stageName: "model_extract",
            kind: "model_response",
            mediaType: "application/json",
            body: stableStringify(result.responseForAudit),
          });
          responseArtifactId = responseArtifact.id;
        } catch (error) {
          if (
            error instanceof OpenRouterConfigurationError ||
            error instanceof OpenRouterRequestError
          ) {
            throw error;
          }
          throw new SyncPaidOutcomeUncertainError(error);
        }
      }

      await attachExtractionResponse(sql, {
        extractionId: reservation.id,
        responseArtifactId,
        resolvedModel: result.resolvedModel,
        reusedFromExtractionId,
        providerRequestId: result.generationId,
        finishReason: result.finishReason,
        inputTokens: result.usage.inputTokens ?? 0,
        cachedInputTokens: result.usage.cachedInputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        reasoningTokens: result.usage.reasoningTokens ?? 0,
        costUsd: reusable ? 0 : (result.usage.costUsd ?? 0),
        costSource: reusable
          ? "cache"
          : result.usage.costUsd === null
            ? "unknown"
            : "provider",
        latencyMs: result.latencyMilliseconds,
      });
      return { result, extractionId: reservation.id };
    });

    const modelValidation = await runStage("schema_validate", async () =>
      adapter.validateModelOutput(claim, modelResult.result.parsed),
    );

    const finalised = await runStage("domain_validate", async (stageId) => {
      const outcome = adapter.finalise({
        claim,
        listingTitle: await readListingTitle(sql, claim.recordId),
        model: modelResult.result.parsed,
        pageMarkdown,
        responseError: modelResult.result.responseError,
        finishReason: modelResult.result.finishReason,
      });
      const validated = await persistArtifact({
        stageId,
        stageName: "domain_validate",
        kind: "validated_json",
        mediaType: "application/json",
        body: stableStringify(outcome.extraction),
      });
      await persistArtifact({
        stageId,
        stageName: "domain_validate",
        kind: "validation_report",
        mediaType: "application/json",
        body: stableStringify({
          modelSchemaValid: modelValidation.success,
          modelSchemaIssues: modelValidation.issues,
          ...(typeof outcome.report === "object" && outcome.report !== null
            ? (outcome.report as Record<string, unknown>)
            : {}),
        }),
      });
      await completeExtraction(sql, {
        extractionId: modelResult.extractionId,
        validatedArtifactId: validated.id,
        schemaValid: modelValidation.success,
        domainValid: outcome.errorCount === 0,
        warningCount: outcome.warningCount,
        errorCount: outcome.errorCount,
        errorSummary:
          outcome.errorCount === 0
            ? null
            : `${outcome.errorCount} part${outcome.errorCount === 1 ? "" : "s"} of the model response could not be used and need review.`,
      });
      return outcome;
    });

    const write = await runStage("content_project", async (stageId) => {
      const result = adapter.project(finalised.extraction);
      await persistArtifact({
        stageId,
        stageName: "content_project",
        kind: "content_projection",
        mediaType: "application/json",
        body: stableStringify(result),
      });
      return result;
    });

    const persisted = await runStage("source_version_persist", async () => {
      if (sourceDocumentId === null) {
        throw new Error("The ANU source document was not preserved.");
      }
      return persistSourceVersion(sql, {
        claim,
        sourceDocumentId,
        write,
      });
    });

    await finishCatalogueSync(sql, {
      syncId: claim.syncId,
      workerId,
      expectedLockVersion: claim.lockVersion,
      status: persisted.status,
      sourceDocumentId,
      sourceVersionId: persisted.sourceVersionId,
      errorCode: null,
      errorMessage: null,
    });
  } catch (error) {
    const code = syncErrorCode(error);
    const summary = safeErrorSummary(error);
    if (
      isRetryableSyncError(error) &&
      !finalDelivery &&
      claim.attemptCount < 5
    ) {
      await releaseCatalogueSyncForRetry(sql, {
        syncId: claim.syncId,
        workerId,
        expectedLockVersion: claim.lockVersion,
        errorCode: code,
        errorMessage: summary,
      });
      throw error;
    }
    await finishCatalogueSync(sql, {
      syncId: claim.syncId,
      workerId,
      expectedLockVersion: claim.lockVersion,
      status: "failed",
      sourceDocumentId,
      sourceVersionId: null,
      errorCode: code,
      errorMessage: summary,
    });
  }
}
