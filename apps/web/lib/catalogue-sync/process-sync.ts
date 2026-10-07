import {
  compactStructureAdapter,
  COMPACT_STRUCTURE_PARSER_VERSION,
  COMPACT_STRUCTURE_MAX_INPUT_BYTES,
} from "../catalogue-import/kinds/structure/compact-adapter.ts";
import {
  readStructureSource,
  heldStructureRequirements,
} from "../catalogue-import/kinds/structure/source-parser.ts";
import type { AcademicStructureKind } from "../catalogue-import/kinds/structure/contract.ts";
import { parsePlainCourseRequisites } from "../catalogue-import/kinds/course/plain-requisites.ts";
import { randomUUID } from "node:crypto";
import {
  compactCourseAdapter,
  COMPACT_COURSE_PARSER_VERSION,
  COMPACT_COURSE_MAX_INPUT_BYTES,
} from "../catalogue-import/kinds/course/compact-adapter.ts";
import {
  CourseRunBudgetError,
  reserveCourseRunSpend,
  settleCourseRunSpend,
} from "../catalogue-runs/budget.ts";
import { extractionUsageForStorage } from "./extraction-usage.ts";
import {
  CatalogueProviderPausedError,
  catalogueProviderPauseReason,
  catalogueProviderResponsePause,
  type CatalogueProviderPause,
} from "./provider-pause.ts";
import {
  holdQueuedSyncWhenProviderPaused,
  readCatalogueProviderPause,
  readCatalogueProviderControl,
  pauseCatalogueProviderAndSync,
} from "./provider-store.ts";
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
  recordExtractionRequestFailure,
  releaseCatalogueSyncForRetry,
  renewCatalogueSyncLease,
  reserveExtraction,
  startSyncStage,
  withSyncDatabaseClient,
} from "./sync-store.ts";
import type { CatalogueSyncAdapter, PromptContext } from "./kind-adapter.ts";
import { courseKindAdapter } from "../catalogue-import/kinds/course/adapter.ts";
import { structureKindAdapter } from "../catalogue-import/kinds/structure/adapter.ts";
import {
  OpenRouterConfigurationError,
  OpenRouterRequestError,
  buildOpenRouterRequestBody,
  extractWithOpenRouter,
  restoreOpenRouterExtraction,
} from "../catalogue-import/openrouter.ts";
import { persistSourceVersionAndFinishSync } from "./persist-source-version.ts";
import type { CatalogueKind } from "../catalogue/content.ts";

const TERMINAL_SYNC_STATUSES = new Set([
  "paused",
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

export class SyncExtractionInvalidError extends TypeError {
  readonly code = "MODEL_EXTRACTION_INVALID";

  constructor() {
    super(
      "The model response was incomplete or contained no usable catalogue content. Its response and validation report were preserved, but no source version or draft was changed.",
    );
    this.name = "SyncExtractionInvalidError";
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
    if (await holdQueuedSyncWhenProviderPaused(sql, syncId)) return;
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
    // Any sync that belongs to a run, course or structure, starts the next
    // item itself in queue mode; inline runs are advanced by the browser.
    if (process.env.COURSEMAP_QUEUE_SYNCS_ENABLED === "true") {
      const [item] =
        await sql`select run_id from public.catalogue_course_run_items where sync_id = ${syncId}::uuid`;
      if (item) {
        const { advanceCourseRun } =
          await import("../catalogue-runs/advance.ts");
        await advanceCourseRun(String(item.run_id));
      }
    }
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
  const compact =
    claim.kind === "course" &&
    claim.parserVersion === COMPACT_COURSE_PARSER_VERSION;
  const compactStructure =
    ["major", "minor", "specialisation"].includes(claim.kind) &&
    claim.parserVersion === COMPACT_STRUCTURE_PARSER_VERSION;
  const sourceFirst = compact || compactStructure;
  const adapter = compactStructure
    ? compactStructureAdapter
    : compact
      ? compactCourseAdapter
      : syncAdapterForKind(claim.kind);
  let sourceDocumentId: number | null = null;
  let requestProviderRevision = claim.providerRevision;

  const runStage = async <T>(
    stageName: SyncStageName,
    work: (stageId: string) => Promise<T>,
  ) => {
    signal?.throwIfAborted();
    // Each stage starts with a fresh lease, and a worker that has lost its
    // lease stops before fetching, paying for a model call or writing.
    await renewCatalogueSyncLease(sql, {
      syncId: claim.syncId,
      workerId,
      expectedLockVersion: claim.lockVersion,
    });
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

    let promptContext: PromptContext | undefined;
    const userPrompt = await runStage(
      "model_input_prepare",
      async (stageId) => {
        promptContext = adapter.loadPromptContext
          ? await adapter.loadPromptContext(sql, claim)
          : undefined;
        const prompt = adapter.buildUserPrompt(
          claim,
          pageMarkdown,
          promptContext,
        );
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
      reasoningEffort: adapter.reasoningEffort,
    });
    const fingerprint = stableFingerprint({
      sourceContentSha256: page.contentSha256,
      parserVersion: claim.parserVersion,
      promptVersion: claim.promptVersion,
      schemaVersion: claim.schemaVersion,
      requestBody,
    });

    const modelResult = await runStage("model_extract", async (stageId) => {
      const pause = await readCatalogueProviderPause(sql);
      if (pause) throw new CatalogueProviderPausedError(pause);
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
      // A resumed reservation retains its own paid outcome and accounting.
      const reusable = reservation.created
        ? await findReusableExtraction(sql, fingerprint)
        : null;

      let result;
      let responseArtifactId: string;
      let reusedFromExtractionId: string | null = null;
      let responsePause: CatalogueProviderPause | null = null;

      if (reusable) {
        // Identical input already produced a validated response; reuse it
        // instead of paying for another call.
        const body = await readSyncArtifact({
          artifact: reusable.responseArtifact,
        });
        result = restoreOpenRouterExtraction(
          JSON.parse(body) as unknown,
          claim.requestedModel,
          adapter.schemaName,
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
          adapter.schemaName,
        );
      } else {
        try {
          const control = await readCatalogueProviderControl(sql);
          if (control.pause)
            throw new CatalogueProviderPausedError(control.pause);
          requestProviderRevision = control.revision;
          const plain = compact
            ? parsePlainCourseRequisites(
                (JSON.parse(userPrompt) as { requisiteText: string | null })
                  .requisiteText,
              )
            : null;
          const oversized =
            compact &&
            Buffer.byteLength(JSON.stringify(requestBody), "utf8") >
              COMPACT_COURSE_MAX_INPUT_BYTES;
          const localRequisites =
            plain ??
            (oversized
              ? {
                  ...parsePlainCourseRequisites(null)!,
                  unmodelledText: [
                    (JSON.parse(userPrompt) as { requisiteText: string })
                      .requisiteText,
                  ],
                }
              : null);
          const structureSource = compactStructure
            ? readStructureSource(
                claim.kind as AcademicStructureKind,
                claim.code,
                claim.academicYear,
                pageMarkdown,
                promptContext?.knownStructures,
              )
            : null;
          const localStructure =
            structureSource?.plain ??
            (structureSource &&
            Buffer.byteLength(JSON.stringify(requestBody), "utf8") >
              COMPACT_STRUCTURE_MAX_INPUT_BYTES
              ? heldStructureRequirements(structureSource.extraction)
              : null);
          let localResult = localRequisites
            ? { requisites: localRequisites }
            : localStructure
              ? { requirements: localStructure }
              : null;
          if (claim.allowAi === false && !localResult) {
            if (!sourceFirst) {
              throw new Error(
                "AI is disabled and this importer has no deterministic extraction path.",
              );
            }
            if (compact) {
              const requisiteText = (
                JSON.parse(userPrompt) as { requisiteText: string | null }
              ).requisiteText;
              localResult = {
                requisites: {
                  ...parsePlainCourseRequisites(null)!,
                  unmodelledText: requisiteText ? [requisiteText] : [],
                },
              };
            } else if (structureSource) {
              localResult = {
                requirements: heldStructureRequirements(
                  structureSource.extraction,
                ),
              };
            } else {
              throw new Error(
                "Deterministic requirements could not be prepared while AI is disabled.",
              );
            }
          }
          if (sourceFirst && !localResult)
            await reserveCourseRunSpend(
              sql,
              claim.syncId,
              Buffer.byteLength(JSON.stringify(requestBody), "utf8"),
            );
          result = localResult
            ? restoreOpenRouterExtraction(
                {
                  id: null,
                  model: claim.requestedModel,
                  content: JSON.stringify(localResult),
                  finishReason: "stop",
                  latencyMilliseconds: 0,
                  usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    cachedInputTokens: 0,
                    reasoningTokens: 0,
                    costUsd: 0,
                  },
                  extractionMethod: "deterministic",
                  responseError: null,
                },
                claim.requestedModel,
                adapter.schemaName,
              )
            : await extractWithOpenRouter({
                model: claim.requestedModel,
                systemPrompt,
                modelInput: userPrompt,
                schema: adapter.extractionJsonSchema,
                schemaName: adapter.schemaName,
                maxOutputTokens: adapter.maxOutputTokens,
                reasoningEffort: adapter.reasoningEffort,
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
          responsePause = catalogueProviderResponsePause(result.providerError);
        } catch (error) {
          if (
            error instanceof CourseRunBudgetError ||
            error instanceof OpenRouterConfigurationError ||
            error instanceof OpenRouterRequestError ||
            error instanceof CatalogueProviderPausedError
          ) {
            await recordExtractionRequestFailure(sql, {
              extractionId: reservation.id,
              outcome:
                error instanceof OpenRouterRequestError
                  ? "rejected"
                  : "not_sent",
              providerHttpStatus:
                error instanceof OpenRouterRequestError ? error.status : null,
              errorSummary: safeErrorSummary(error),
            });
            throw error;
          }
          throw new SyncPaidOutcomeUncertainError(error);
        }
      }

      if (reservation.created) {
        await attachExtractionResponse(sql, {
          extractionId: reservation.id,
          responseArtifactId,
          resolvedModel: result.resolvedModel,
          reusedFromExtractionId,
          providerRequestId: result.generationId,
          finishReason: result.finishReason,
          ...extractionUsageForStorage(result.usage, Boolean(reusable)),
          latencyMs: result.latencyMilliseconds,
        });
      }
      if (sourceFirst)
        await settleCourseRunSpend(
          sql,
          claim.syncId,
          reusable ? 0 : result.usage.costUsd,
        );
      return { result, extractionId: reservation.id, responsePause };
    });

    const modelValidation = await runStage("schema_validate", async () =>
      adapter.validateModelOutput(
        claim,
        modelResult.result.parsed,
        promptContext,
      ),
    );

    const finalised = await runStage("domain_validate", async (stageId) => {
      const outcome = adapter.finalise({
        claim,
        listingTitle: await readListingTitle(sql, claim.recordId),
        model: modelResult.result.parsed,
        pageMarkdown,
        responseError: modelResult.result.responseError,
        responseRepair: modelResult.result.responseRepair,
        finishReason: modelResult.result.finishReason,
        context: promptContext,
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
        domainValid: outcome.canPersist && outcome.errorCount === 0,
        warningCount: outcome.warningCount,
        errorCount: outcome.errorCount,
        errorSummary: !outcome.canPersist
          ? new SyncExtractionInvalidError().message
          : outcome.errorCount === 0
            ? null
            : `${outcome.errorCount} part${outcome.errorCount === 1 ? "" : "s"} of the model response could not be used and need review.`,
      });
      if (!outcome.canPersist) {
        if (modelResult.responsePause)
          throw new CatalogueProviderPausedError(modelResult.responsePause);
        throw new SyncExtractionInvalidError();
      }
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

    await runStage("source_version_persist", async () => {
      if (sourceDocumentId === null) {
        throw new Error("The ANU source document was not preserved.");
      }
      // Records the sync result in the same transaction.
      return persistSourceVersionAndFinishSync(sql, {
        claim,
        sourceDocumentId,
        write,
      });
    });

    if (sourceFirst) {
      const { publishVerifiedRunCandidate } =
        await import("../catalogue-runs/publication.ts");
      await publishVerifiedRunCandidate(sql, claim.syncId, write);
    }
  } catch (error) {
    if (sourceFirst && error instanceof SyncPaidOutcomeUncertainError)
      await settleCourseRunSpend(sql, claim.syncId, null);
    if (sourceFirst && error instanceof CourseRunBudgetError)
      await sql`update public.catalogue_course_runs set state = 'paused', pause_reason = ${error.message} where id = (select run_id from public.catalogue_course_run_items where sync_id = ${claim.syncId}::uuid) and state = 'active'`;
    const code = syncErrorCode(error);
    const summary = safeErrorSummary(error);
    const pauseReason = catalogueProviderPauseReason(error);
    if (pauseReason) {
      await pauseCatalogueProviderAndSync(sql, {
        syncId: claim.syncId,
        workerId,
        expectedLockVersion: claim.lockVersion,
        pause: { reason: pauseReason, message: summary },
        expectedProviderRevision: requestProviderRevision,
        errorCode:
          error instanceof CatalogueProviderPausedError
            ? "OPENROUTER_PROVIDER_PAUSED"
            : code,
        sourceDocumentId,
      });
      return;
    }
    if (
      isRetryableSyncError(error) &&
      !finalDelivery &&
      (claim.retryCount ?? claim.attemptCount) < 5
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
