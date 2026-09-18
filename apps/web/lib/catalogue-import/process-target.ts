import { randomUUID } from "node:crypto";
import {
  ImportArtifactConfigurationError,
  type ImportArtifactKind,
  readImportArtifact,
  storeImportArtifact,
} from "./artifact-store.ts";
import { stableFingerprint, stableStringify } from "./canonical.ts";
import {
  type ClaimedImportTarget,
  type ImportSql,
  type ImportStageName,
  attachExtractionResponse,
  claimImportTarget,
  completeExtraction,
  failImportStage,
  findReusableExtraction,
  finishImportStage,
  finishImportTarget,
  getImportTargetStatus,
  recordImportArtifact,
  recordSourcePage,
  releaseImportTargetForRetry,
  reserveExtraction,
  startImportStage,
  withImportDatabaseClient,
} from "./import-store.ts";
import type { CatalogueKindAdapter } from "./kind-adapter.ts";
import { courseKindAdapter } from "./kinds/course/adapter.ts";
import { structureKindAdapter } from "./kinds/structure/adapter.ts";
import {
  OpenRouterConfigurationError,
  OpenRouterRequestError,
  buildOpenRouterRequestBody,
  extractWithOpenRouter,
  restoreOpenRouterExtraction,
} from "./openrouter.ts";
import { persistSnapshotCandidate } from "./persist-snapshot.ts";
import type { CatalogueKind } from "./snapshot-write.ts";

const TERMINAL_TARGET_STATUSES = new Set(["ready", "unchanged", "failed", "cancelled"]);

export const CATALOGUE_KIND_ADAPTERS: readonly CatalogueKindAdapter[] = [
  courseKindAdapter as CatalogueKindAdapter,
  structureKindAdapter as CatalogueKindAdapter,
];

export function adapterForKind(kind: CatalogueKind): CatalogueKindAdapter {
  const adapter = CATALOGUE_KIND_ADAPTERS.find((candidate) =>
    candidate.kinds.includes(kind),
  );
  if (!adapter) throw new TypeError(`No import adapter handles ${kind}.`);
  return adapter;
}

export class ImportPaidOutcomeUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "An OpenRouter request may have reached the provider, but its response was not durably recorded. Coursemap will not issue an automatic second paid call.",
      { cause },
    );
    this.name = "ImportPaidOutcomeUncertainError";
  }
}

export class ImportVersionMismatchError extends TypeError {
  readonly code = "IMPORT_VERSION_UNSUPPORTED";

  constructor() {
    super(
      "The queued import was created for a different pipeline version. Start a new import with the deployed worker.",
    );
    this.name = "ImportVersionMismatchError";
  }
}

function assertCurrentVersions(adapter: CatalogueKindAdapter, claim: ClaimedImportTarget) {
  if (
    claim.parserVersion !== adapter.parserVersion ||
    claim.promptVersion !== adapter.promptVersion ||
    claim.schemaVersion !== adapter.schemaVersion
  ) {
    throw new ImportVersionMismatchError();
  }
}

export function safeErrorSummary(error: unknown) {
  const source = error instanceof Error ? error.message : "Catalogue import failed.";
  return source
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database URL redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[OpenRouter key redacted]")
    .slice(0, 1_500);
}

export function importErrorCode(error: unknown) {
  if (error instanceof ImportPaidOutcomeUncertainError) return "OPENROUTER_OUTCOME_UNCERTAIN";
  if (error instanceof OpenRouterConfigurationError) return "OPENROUTER_NOT_CONFIGURED";
  if (error instanceof OpenRouterRequestError) return `OPENROUTER_HTTP_${error.status}`;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim()
  ) {
    return error.code.trim().slice(0, 120);
  }
  return error instanceof TypeError ? "INVALID_PIPELINE_DATA" : "IMPORT_FAILED";
}

export function isRetryableImportError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return error.retryable;
  }
  // A definitive HTTP failure is safe to report, but retrying the same target
  // would be misread as an uncertain paid outcome by the reservation check.
  if (error instanceof OpenRouterRequestError) return false;
  if (
    error instanceof OpenRouterConfigurationError ||
    error instanceof ImportPaidOutcomeUncertainError ||
    error instanceof ImportArtifactConfigurationError ||
    error instanceof TypeError
  ) {
    return false;
  }
  return true;
}

export type ProcessImportTargetInput = {
  runId: string;
  targetId: string;
  deliveryCount?: number;
  maxDeliveries?: number;
  signal?: AbortSignal;
};

/**
 * Processes one target end to end under a worker lease. Retryable failures
 * return the target to the queue until the final delivery; everything else
 * records a failed target so the queue can acknowledge the message.
 */
export async function processImportTarget({
  runId,
  targetId,
  deliveryCount = 1,
  maxDeliveries = 5,
  signal,
}: ProcessImportTargetInput): Promise<void> {
  await withImportDatabaseClient(async (sql) => {
    signal?.throwIfAborted();
    const workerId = randomUUID();
    const claim = await claimImportTarget(sql, { runId, targetId, workerId });
    if (claim === null) {
      const status = await getImportTargetStatus(sql, { runId, targetId });
      if (status && TERMINAL_TARGET_STATUSES.has(status.status)) return;
      throw new Error("The import target could not be claimed.");
    }
    await processClaimedTarget({
      sql,
      claim,
      workerId,
      finalDelivery: deliveryCount >= maxDeliveries,
      signal,
    });
  });
}

async function processClaimedTarget({
  sql,
  claim,
  workerId,
  finalDelivery,
  signal,
}: {
  sql: ImportSql;
  claim: ClaimedImportTarget;
  workerId: string;
  finalDelivery: boolean;
  signal?: AbortSignal;
}) {
  const adapter = adapterForKind(claim.kind);
  let sourcePageId: number | null = null;

  const runStage = async <T>(
    stageName: ImportStageName,
    work: (stageId: string) => Promise<T>,
  ) => {
    signal?.throwIfAborted();
    const stageId = await startImportStage(sql, {
      targetId: claim.targetId,
      stageName,
      attemptNumber: claim.attemptCount,
    });
    try {
      const value = await work(stageId);
      signal?.throwIfAborted();
      await finishImportStage(sql, { stageId });
      return value;
    } catch (error) {
      await failImportStage(sql, {
        stageId,
        errorCode: importErrorCode(error),
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
    stageName: ImportStageName;
    kind: ImportArtifactKind;
    mediaType: string;
    body: string;
  }) => {
    signal?.throwIfAborted();
    const stored = await storeImportArtifact({
      academicYear: claim.academicYear,
      runId: claim.runId,
      targetId: claim.targetId,
      stage: stageName,
      kind,
      mediaType,
      body,
    });
    return recordImportArtifact(sql, {
      targetId: claim.targetId,
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
      sourcePageId = await recordSourcePage(sql, {
        sourceId: claim.sourceId,
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

    const prepared = await runStage("markdown_normalise", async (stageId) => {
      const result = adapter.prepareInput(claim, page);
      await persistArtifact({
        stageId,
        stageName: "markdown_normalise",
        kind: "normalised_markdown",
        mediaType: "text/markdown",
        body: result.markdown,
      });
      return result;
    });

    const userPrompt = await runStage("model_input_prepare", async (stageId) => {
      const prompt = adapter.buildUserPrompt(claim, prepared.modelInput);
      await persistArtifact({
        stageId,
        stageName: "model_input_prepare",
        kind: "model_input",
        mediaType: "text/plain",
        body: prompt,
      });
      return prompt;
    });

    const deterministic = await runStage("deterministic_extract", async (stageId) => {
      const result = adapter.extractDeterministic(claim, page);
      await persistArtifact({
        stageId,
        stageName: "deterministic_extract",
        kind: "deterministic_output",
        mediaType: "application/json",
        body: stableStringify(result),
      });
      return result;
    });

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
        targetId: claim.targetId,
        extractionNumber: claim.attemptCount,
        requestedModel: claim.requestedModel,
        fingerprint,
        promptVersion: claim.promptVersion,
        schemaVersion: claim.schemaVersion,
        requestArtifactId: requestArtifact.id,
      });
      const reusable = await findReusableExtraction(sql, { fingerprint });

      let result;
      let responseArtifactId: string;
      let reusedFromExtractionId: string | null = null;

      if (reusable) {
        // Identical input already produced a validated response; reuse it
        // instead of paying for another call.
        const body = await readImportArtifact({ artifact: reusable.responseArtifact });
        result = restoreOpenRouterExtraction(JSON.parse(body) as unknown, claim.requestedModel);
        const responseArtifact = await persistArtifact({
          stageId,
          stageName: "model_extract",
          kind: "model_response",
          mediaType: "application/json",
          body: stableStringify(result.responseForAudit),
        });
        responseArtifactId = responseArtifact.id;
        reusedFromExtractionId = reusable.id === reservation.id ? null : reusable.id;
      } else if (!reservation.created) {
        if (!reservation.responseArtifactId) {
          throw new ImportPaidOutcomeUncertainError(null);
        }
        responseArtifactId = reservation.responseArtifactId;
        const [artifact] = await sql`
          select media_type, content_sha256, byte_size, storage_bucket, storage_path
          from public.catalogue_import_artifacts where id = ${responseArtifactId}::uuid
        `;
        const body = await readImportArtifact({
          artifact: {
            bucket: artifact.storage_bucket,
            path: String(artifact.storage_path),
            mediaType: String(artifact.media_type),
            contentSha256: String(artifact.content_sha256),
            byteSize: Number(artifact.byte_size),
          },
        });
        result = restoreOpenRouterExtraction(JSON.parse(body) as unknown, claim.requestedModel);
      } else {
        try {
          result = await extractWithOpenRouter({
            model: claim.requestedModel,
            systemPrompt,
            modelInput: userPrompt,
            schema: adapter.extractionJsonSchema,
            schemaName: adapter.schemaName,
            maxOutputTokens: adapter.maxOutputTokens,
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
          throw new ImportPaidOutcomeUncertainError(error);
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
        costSource: reusable ? "cache" : result.usage.costUsd === null ? "unknown" : "provider",
        latencyMs: result.latencyMilliseconds,
      });
      return { result, extractionId: reservation.id };
    });

    const modelValidation = await runStage("schema_validate", async () =>
      adapter.validateModelOutput(claim, modelResult.result.parsed),
    );

    const merged = await runStage("domain_validate", async (stageId) => {
      const outcome = adapter.merge({
        claim,
        deterministic,
        model: modelResult.result.parsed,
        modelValid: modelValidation.success,
        modelInput: userPrompt,
        responseError: modelResult.result.responseError,
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
        domainValid: outcome.modelValid && outcome.errorCount === 0,
        warningCount: outcome.warningCount,
        errorCount: outcome.errorCount,
        errorSummary:
          outcome.modelValid && outcome.errorCount === 0
            ? null
            : "The model response failed strict extraction validation; deterministic data was retained.",
      });
      return outcome;
    });

    const write = await runStage("database_project", async (stageId) => {
      const result = adapter.project(merged.extraction);
      await persistArtifact({
        stageId,
        stageName: "database_project",
        kind: "database_projection",
        mediaType: "application/json",
        body: stableStringify(result),
      });
      return result;
    });

    const persisted = await runStage("snapshot_persist", async (stageId) => {
      const result = await persistSnapshotCandidate(sql, { claim, sourcePageId, write });
      await persistArtifact({
        stageId,
        stageName: "snapshot_persist",
        kind: "change_set",
        mediaType: "application/json",
        body: stableStringify(result.changeSet),
      });
      return result;
    });

    await finishImportTarget(sql, {
      runId: claim.runId,
      targetId: claim.targetId,
      workerId,
      expectedLockVersion: claim.lockVersion,
      status: persisted.changeKind === "unchanged" ? "unchanged" : "ready",
      changeKind: persisted.changeKind,
      sourcePageId,
      candidateSnapshotId: persisted.candidateSnapshotId,
    });
  } catch (error) {
    const code = importErrorCode(error);
    const summary = safeErrorSummary(error);
    if (isRetryableImportError(error) && !finalDelivery && claim.attemptCount < 5) {
      await releaseImportTargetForRetry(sql, {
        runId: claim.runId,
        targetId: claim.targetId,
        workerId,
        expectedLockVersion: claim.lockVersion,
        errorCode: code,
        errorMessage: summary,
      });
      throw error;
    }
    await finishImportTarget(sql, {
      runId: claim.runId,
      targetId: claim.targetId,
      workerId,
      expectedLockVersion: claim.lockVersion,
      status: "failed",
      changeKind: null,
      sourcePageId,
      candidateSnapshotId: null,
      errorCode: code,
      errorMessage: summary,
    });
  }
}
