import type postgres from "postgres";
import {
  createHostedImportDatabaseClient,
  createLocalDatabaseClient,
} from "../../scripts/catalogue/lib/local-database.mjs";
import type { ImportArtifactKind, ImportArtifactLocator } from "./artifact-store.ts";
import { ANU_PROGRAMS_AND_COURSES_SOURCE } from "./import-source.ts";
import type { CatalogueKind } from "./snapshot-write.ts";

export type ImportStageName =
  | "source_fetch"
  | "html_capture"
  | "markdown_normalise"
  | "model_input_prepare"
  | "deterministic_extract"
  | "model_extract"
  | "schema_validate"
  | "domain_validate"
  | "database_project"
  | "snapshot_persist";

export type ImportSql = Awaited<ReturnType<typeof createImportDatabaseClient>>;
export type ImportTransactionSql = postgres.TransactionSql;
type AnyImportSql = ImportSql | ImportTransactionSql;

export class ImportStoreError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ImportStoreError";
    this.code = code;
  }
}

export class ImportDatabaseConfigurationError extends Error {
  constructor() {
    super(
      "Configure COURSEMAP_IMPORT_DATABASE_URL before running durable imports on Vercel.",
    );
    this.name = "ImportDatabaseConfigurationError";
  }
}

/** Development uses the local database; every other environment needs the worker URL. */
export async function createImportDatabaseClient() {
  const configured = process.env.COURSEMAP_IMPORT_DATABASE_URL?.trim();
  if (process.env.NODE_ENV === "development" && !configured) {
    return createLocalDatabaseClient();
  }
  if (!configured) throw new ImportDatabaseConfigurationError();
  return createHostedImportDatabaseClient(configured);
}

export async function withImportDatabaseClient<T>(
  callback: (sql: ImportSql) => Promise<T>,
) {
  const sql = await createImportDatabaseClient();
  try {
    return await callback(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type ClaimedImportTarget = {
  runId: string;
  targetId: string;
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  academicYearId: number;
  itemId: number;
  itemYearId: number;
  directoryEntryId: number | null;
  baselineSnapshotId: number | null;
  requestedModel: string;
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  sourceId: number;
  attemptCount: number;
  lockVersion: number;
  leaseExpiresAt: string;
};

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

async function ensureAnuSourceId(sql: AnyImportSql) {
  const [existing] = await sql`
    select id from public.catalogue_sources
    where kind = ${ANU_PROGRAMS_AND_COURSES_SOURCE.kind}
      and base_url = ${ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl}
  `;
  if (existing) return Number(existing.id);
  const [inserted] = await sql`
    insert into public.catalogue_sources (name, kind, base_url, is_active)
    values (
      ${ANU_PROGRAMS_AND_COURSES_SOURCE.name},
      ${ANU_PROGRAMS_AND_COURSES_SOURCE.kind},
      ${ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl},
      true
    )
    on conflict (kind, base_url) do update set is_active = true
    returning id
  `;
  return Number(inserted.id);
}

/**
 * Takes a lease on a queued target, or on a running target whose lease has
 * expired. Returns null when the target is not claimable, including when it
 * has already finished or been cancelled.
 */
export async function claimImportTarget(
  sql: ImportSql,
  {
    runId,
    targetId,
    workerId,
    leaseSeconds = 120,
  }: { runId: string; targetId: string; workerId: string; leaseSeconds?: number },
): Promise<ClaimedImportTarget | null> {
  return sql.begin(async (tx) => {
    const sourceId = await ensureAnuSourceId(tx);
    const [row] = await tx`
      update public.catalogue_import_targets as targets
      set
        status = 'running',
        attempt_count = targets.attempt_count + 1,
        lock_version = targets.lock_version + 1,
        worker_id = ${workerId}::uuid,
        lease_expires_at = now() + make_interval(secs => ${leaseSeconds})
      from public.catalogue_import_runs as runs
      join public.academic_years on academic_years.id = runs.academic_year_id
      where targets.id = ${targetId}::uuid
        and targets.run_id = ${runId}::uuid
        and runs.id = targets.run_id
        and targets.attempt_count < 5
        and (
          targets.status = 'queued'
          or (targets.status = 'running' and targets.lease_expires_at < now())
        )
      returning
        targets.id,
        targets.run_id,
        targets.kind,
        targets.code,
        academic_years.year as academic_year,
        targets.academic_year_id,
        targets.item_id,
        targets.item_year_id,
        targets.directory_entry_id,
        targets.baseline_snapshot_id,
        runs.requested_model,
        runs.parser_version,
        runs.prompt_version,
        runs.schema_version,
        targets.attempt_count,
        targets.lock_version,
        targets.lease_expires_at
    `;
    if (!row) return null;
    await tx`select private.refresh_catalogue_import_run(${runId}::uuid)`;
    return {
      runId: String(row.run_id),
      targetId: String(row.id),
      kind: row.kind as CatalogueKind,
      code: String(row.code),
      academicYear: Number(row.academic_year),
      academicYearId: Number(row.academic_year_id),
      itemId: Number(row.item_id),
      itemYearId: Number(row.item_year_id),
      directoryEntryId: numberOrNull(row.directory_entry_id),
      baselineSnapshotId: numberOrNull(row.baseline_snapshot_id),
      requestedModel: String(row.requested_model),
      parserVersion: String(row.parser_version),
      promptVersion: String(row.prompt_version),
      schemaVersion: String(row.schema_version),
      sourceId,
      attemptCount: Number(row.attempt_count),
      lockVersion: Number(row.lock_version),
      leaseExpiresAt: new Date(row.lease_expires_at as string).toISOString(),
    };
  });
}

export async function getImportTargetStatus(
  sql: AnyImportSql,
  { runId, targetId }: { runId: string; targetId: string },
) {
  const [row] = await sql`
    select status from public.catalogue_import_targets
    where id = ${targetId}::uuid and run_id = ${runId}::uuid
  `;
  return row ? { status: String(row.status) } : null;
}

export async function startImportStage(
  sql: AnyImportSql,
  {
    targetId,
    stageName,
    attemptNumber,
  }: { targetId: string; stageName: ImportStageName; attemptNumber: number },
) {
  const [row] = await sql`
    insert into public.catalogue_import_stages (target_id, stage_name, attempt_number)
    values (${targetId}::uuid, ${stageName}, ${attemptNumber})
    on conflict (target_id, stage_name, attempt_number) do update
    set status = 'running', started_at = statement_timestamp(),
        completed_at = null, error_code = null, error_summary = null
    returning id
  `;
  return String(row.id);
}

export async function finishImportStage(
  sql: AnyImportSql,
  { stageId }: { stageId: string },
) {
  await sql`
    update public.catalogue_import_stages
    set status = 'completed', completed_at = statement_timestamp()
    where id = ${stageId}::uuid
  `;
}

export async function failImportStage(
  sql: AnyImportSql,
  {
    stageId,
    errorCode,
    errorSummary,
  }: { stageId: string; errorCode: string; errorSummary: string },
) {
  await sql`
    update public.catalogue_import_stages
    set status = 'failed', completed_at = statement_timestamp(),
        error_code = ${errorCode}, error_summary = ${errorSummary}
    where id = ${stageId}::uuid
  `;
}

export type ImportArtifactRecord = ImportArtifactLocator & {
  id: string;
  kind: ImportArtifactKind;
};

export async function recordImportArtifact(
  sql: AnyImportSql,
  {
    targetId,
    stageId,
    kind,
    attemptNumber,
    mediaType,
    contentSha256,
    byteSize,
    storageBucket,
    storagePath,
  }: {
    targetId: string;
    stageId: string;
    kind: ImportArtifactKind;
    attemptNumber: number;
    mediaType: string;
    contentSha256: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
  },
): Promise<ImportArtifactRecord> {
  const [row] = await sql`
    insert into public.catalogue_import_artifacts (
      target_id, stage_id, kind, attempt_number, media_type, content_sha256,
      byte_size, storage_bucket, storage_path
    ) values (
      ${targetId}::uuid, ${stageId}::uuid, ${kind}, ${attemptNumber}, ${mediaType},
      ${contentSha256}, ${byteSize}, ${storageBucket}, ${storagePath}
    )
    returning id
  `;
  return {
    id: String(row.id),
    kind,
    bucket: storageBucket as ImportArtifactLocator["bucket"],
    path: storagePath,
    mediaType,
    contentSha256,
    byteSize,
  };
}

/** Records a fetched page once; the same content hash for the same key is reused. */
export async function recordSourcePage(
  sql: AnyImportSql,
  {
    sourceId,
    academicYearId,
    kind,
    externalKey,
    canonicalUrl,
    contentSha256,
    httpStatus,
    httpEtag,
    sourceLastModified,
    fetchedAt,
    byteSize,
    storageBucket,
    storagePath,
  }: {
    sourceId: number;
    academicYearId: number;
    kind: CatalogueKind | "directory";
    externalKey: string;
    canonicalUrl: string;
    contentSha256: string;
    httpStatus: number | null;
    httpEtag: string | null;
    sourceLastModified: string | null;
    fetchedAt: string;
    byteSize: number | null;
    storageBucket: string | null;
    storagePath: string | null;
  },
) {
  await sql`
    insert into public.catalogue_source_pages (
      source_id, academic_year_id, kind, external_key, canonical_url, media_type,
      content_sha256, http_status, http_etag, source_last_modified, fetched_at,
      byte_size, storage_bucket, storage_path
    ) values (
      ${sourceId}, ${academicYearId}, ${kind}, ${externalKey}, ${canonicalUrl}, 'text/html',
      ${contentSha256}, ${httpStatus}, ${httpEtag}, ${sourceLastModified}, ${fetchedAt},
      ${byteSize}, ${storageBucket}, ${storagePath}
    )
    on conflict (source_id, academic_year_id, kind, external_key, content_sha256) do nothing
  `;
  const [row] = await sql`
    select id from public.catalogue_source_pages
    where source_id = ${sourceId} and academic_year_id = ${academicYearId}
      and kind = ${kind} and external_key = ${externalKey}
      and content_sha256 = ${contentSha256}
  `;
  return Number(row.id);
}

export type ReusableExtraction = {
  id: string;
  targetId: string;
  responseArtifact: ImportArtifactLocator;
};

/** A validated extraction for identical input can be reused without a paid call. */
export async function findReusableExtraction(
  sql: AnyImportSql,
  { fingerprint }: { fingerprint: string },
): Promise<ReusableExtraction | null> {
  const [row] = await sql`
    select extractions.id, extractions.target_id,
      artifacts.media_type, artifacts.content_sha256, artifacts.byte_size,
      artifacts.storage_bucket, artifacts.storage_path
    from public.catalogue_extractions as extractions
    join public.catalogue_import_artifacts as artifacts
      on artifacts.id = extractions.response_artifact_id
    where extractions.fingerprint = ${fingerprint}
      and extractions.validation_status = 'valid'
    order by extractions.completed_at desc
    limit 1
  `;
  if (!row) return null;
  return {
    id: String(row.id),
    targetId: String(row.target_id),
    responseArtifact: {
      bucket: row.storage_bucket as ImportArtifactLocator["bucket"],
      path: String(row.storage_path),
      mediaType: String(row.media_type),
      contentSha256: String(row.content_sha256),
      byteSize: Number(row.byte_size),
    },
  };
}

export type ExtractionReservation = {
  id: string;
  created: boolean;
  responseArtifactId: string | null;
};

/**
 * Reserves the paid model call for this attempt. When a reservation for the
 * same fingerprint already exists on the target without a recorded response,
 * the caller must not issue a second paid call.
 */
export async function reserveExtraction(
  sql: AnyImportSql,
  {
    targetId,
    extractionNumber,
    requestedModel,
    fingerprint,
    promptVersion,
    schemaVersion,
    requestArtifactId,
  }: {
    targetId: string;
    extractionNumber: number;
    requestedModel: string;
    fingerprint: string;
    promptVersion: string;
    schemaVersion: string;
    requestArtifactId: string;
  },
): Promise<ExtractionReservation> {
  const [existing] = await sql`
    select id, response_artifact_id from public.catalogue_extractions
    where target_id = ${targetId}::uuid and fingerprint = ${fingerprint}
    order by started_at desc limit 1
  `;
  if (existing) {
    return {
      id: String(existing.id),
      created: false,
      responseArtifactId:
        existing.response_artifact_id === null
          ? null
          : String(existing.response_artifact_id),
    };
  }
  const [row] = await sql`
    insert into public.catalogue_extractions (
      target_id, extraction_number, requested_model, fingerprint, prompt_version,
      schema_version, request_artifact_id
    ) values (
      ${targetId}::uuid, ${extractionNumber}, ${requestedModel}, ${fingerprint},
      ${promptVersion}, ${schemaVersion}, ${requestArtifactId}::uuid
    )
    returning id
  `;
  return { id: String(row.id), created: true, responseArtifactId: null };
}

export async function attachExtractionResponse(
  sql: AnyImportSql,
  {
    extractionId,
    responseArtifactId,
    resolvedModel,
    reusedFromExtractionId,
    providerRequestId,
    finishReason,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    costUsd,
    costSource,
    latencyMs,
  }: {
    extractionId: string;
    responseArtifactId: string;
    resolvedModel: string;
    reusedFromExtractionId: string | null;
    providerRequestId: string | null;
    finishReason: string | null;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    costUsd: number;
    costSource: "provider" | "cache" | "unknown";
    latencyMs: number;
  },
) {
  await sql`
    update public.catalogue_extractions
    set response_artifact_id = ${responseArtifactId}::uuid,
        resolved_model = ${resolvedModel},
        reused_from_extraction_id = ${reusedFromExtractionId}::uuid,
        provider_request_id = ${providerRequestId},
        finish_reason = ${finishReason},
        input_tokens = ${inputTokens},
        cached_input_tokens = ${cachedInputTokens},
        output_tokens = ${outputTokens},
        reasoning_tokens = ${reasoningTokens},
        cost_usd = ${costUsd},
        cost_source = ${costSource},
        latency_ms = ${Math.round(latencyMs)}
    where id = ${extractionId}::uuid
  `;
}

export async function completeExtraction(
  sql: AnyImportSql,
  {
    extractionId,
    validatedArtifactId,
    schemaValid,
    domainValid,
    warningCount,
    errorCount,
    errorSummary,
  }: {
    extractionId: string;
    validatedArtifactId: string | null;
    schemaValid: boolean;
    domainValid: boolean;
    warningCount: number;
    errorCount: number;
    errorSummary: string | null;
  },
) {
  await sql`
    update public.catalogue_extractions
    set validated_artifact_id = ${validatedArtifactId}::uuid,
        validation_status = ${schemaValid && domainValid ? "valid" : "invalid"},
        schema_valid = ${schemaValid},
        domain_valid = ${domainValid},
        warning_count = ${warningCount},
        error_count = ${errorCount},
        error_summary = ${errorSummary},
        completed_at = now()
    where id = ${extractionId}::uuid
  `;
}

function assertLeaseHeld(count: number) {
  if (count !== 1) {
    throw new ImportStoreError(
      "The import target lease was lost before its result could be recorded.",
      "LEASE_LOST",
    );
  }
}

export async function finishImportTarget(
  sql: ImportSql,
  {
    runId,
    targetId,
    workerId,
    expectedLockVersion,
    status,
    changeKind,
    sourcePageId,
    candidateSnapshotId,
    errorCode = null,
    errorMessage = null,
  }: {
    runId: string;
    targetId: string;
    workerId: string;
    expectedLockVersion: number;
    status: "ready" | "unchanged" | "failed";
    changeKind: "new" | "changed" | "unchanged" | null;
    sourcePageId: number | null;
    candidateSnapshotId: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  await sql.begin(async (tx) => {
    const updated = await tx`
      update public.catalogue_import_targets
      set status = ${status},
          change_kind = ${changeKind},
          source_page_id = ${sourcePageId},
          candidate_snapshot_id = ${candidateSnapshotId},
          error_code = ${errorCode},
          error_message = ${errorMessage},
          worker_id = null,
          lease_expires_at = null,
          completed_at = now()
      where id = ${targetId}::uuid
        and run_id = ${runId}::uuid
        and status = 'running'
        and worker_id = ${workerId}::uuid
        and lock_version = ${expectedLockVersion}
      returning id
    `;
    assertLeaseHeld(updated.length);
    await tx`select private.refresh_catalogue_import_run(${runId}::uuid)`;
  });
}

export async function releaseImportTargetForRetry(
  sql: ImportSql,
  {
    runId,
    targetId,
    workerId,
    expectedLockVersion,
    errorCode,
    errorMessage,
  }: {
    runId: string;
    targetId: string;
    workerId: string;
    expectedLockVersion: number;
    errorCode: string;
    errorMessage: string;
  },
) {
  await sql.begin(async (tx) => {
    const updated = await tx`
      update public.catalogue_import_targets
      set status = 'queued',
          worker_id = null,
          lease_expires_at = null,
          error_code = ${errorCode},
          error_message = ${errorMessage}
      where id = ${targetId}::uuid
        and run_id = ${runId}::uuid
        and status = 'running'
        and worker_id = ${workerId}::uuid
        and lock_version = ${expectedLockVersion}
      returning id
    `;
    assertLeaseHeld(updated.length);
    await tx`select private.refresh_catalogue_import_run(${runId}::uuid)`;
  });
}

export async function recordImportDispatch(
  sql: ImportSql,
  {
    runId,
    dispatched,
    failedTargetIds,
    errorMessage = "The queue did not accept this target.",
  }: {
    runId: string;
    dispatched: Array<{ targetId: string; messageId: string | null }>;
    failedTargetIds: readonly string[];
    errorMessage?: string;
  },
) {
  await sql.begin(async (tx) => {
    for (const target of dispatched) {
      await tx`
        update public.catalogue_import_targets
        set dispatched_at = coalesce(dispatched_at, now()),
            queue_message_id = coalesce(queue_message_id, ${target.messageId})
        where id = ${target.targetId}::uuid and run_id = ${runId}::uuid and status = 'queued'
      `;
    }
    if (failedTargetIds.length > 0) {
      await tx`
        update public.catalogue_import_targets
        set status = 'failed',
            error_code = 'QUEUE_DISPATCH_FAILED',
            error_message = ${errorMessage},
            completed_at = now()
        where run_id = ${runId}::uuid
          and id = any(${tx.array([...failedTargetIds])}::uuid[])
          and status = 'queued'
      `;
    }
    await tx`select private.refresh_catalogue_import_run(${runId}::uuid)`;
  });
}

export async function listQueuedTargetIds(sql: AnyImportSql, runId: string) {
  const rows = await sql`
    select id from public.catalogue_import_targets
    where run_id = ${runId}::uuid and status = 'queued'
    order by created_at
  `;
  return rows.map((row) => String(row.id));
}
