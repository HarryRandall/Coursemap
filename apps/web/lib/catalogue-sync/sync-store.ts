import type postgres from "postgres";
import {
  createHostedSyncDatabaseClient,
  createLocalDatabaseClient,
} from "../../scripts/catalogue/lib/local-database.mjs";
import type { CatalogueKind } from "../catalogue/content.ts";
import type {
  SyncArtifactKind,
  SyncArtifactLocator,
} from "./artifact-store.ts";
import { ANU_PROGRAMS_AND_COURSES_SOURCE } from "../catalogue-import/import-source.ts";

export type SyncStageName =
  | "source_fetch"
  | "html_capture"
  | "markdown_normalise"
  | "model_input_prepare"
  | "deterministic_extract"
  | "model_extract"
  | "schema_validate"
  | "domain_validate"
  | "content_project"
  | "source_version_persist";

export type SyncSql = Awaited<ReturnType<typeof createSyncDatabaseClient>>;
export type SyncTransactionSql = postgres.TransactionSql;
type AnySyncSql = SyncSql | SyncTransactionSql;

export class SyncStoreError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SyncStoreError";
    this.code = code;
  }
}

export async function createSyncDatabaseClient() {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.COURSEMAP_DATABASE_URL?.trim()
  ) {
    return createLocalDatabaseClient();
  }
  const configured = process.env.COURSEMAP_SYNC_DATABASE_URL?.trim();
  if (configured) return createHostedSyncDatabaseClient(configured);
  throw new Error(
    "Configure COURSEMAP_SYNC_DATABASE_URL before running durable catalogue syncs.",
  );
}

export async function withSyncDatabaseClient<T>(
  callback: (sql: SyncSql) => Promise<T>,
) {
  const sql = await createSyncDatabaseClient();
  try {
    return await callback(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type ClaimedCatalogueSync = {
  syncId: string;
  kind: CatalogueKind;
  code: string;
  academicYear: number;
  academicYearId: number;
  recordId: number;
  previousSourceVersionId: number | null;
  requestedModel: string;
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  sourceId: number;
  attemptCount: number;
  lockVersion: number;
};

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export async function ensureAnuSourceId(sql: AnySyncSql) {
  const [row] = await sql`
    insert into public.catalogue_sources (name, kind, base_url, is_active)
    values (${ANU_PROGRAMS_AND_COURSES_SOURCE.name}, ${ANU_PROGRAMS_AND_COURSES_SOURCE.kind},
      ${ANU_PROGRAMS_AND_COURSES_SOURCE.baseUrl}, true)
    on conflict (kind, base_url) do update set is_active = true
    returning id
  `;
  return Number(row.id);
}

export async function claimCatalogueSync(
  sql: SyncSql,
  {
    syncId,
    workerId,
    leaseSeconds = 120,
  }: {
    syncId: string;
    workerId: string;
    leaseSeconds?: number;
  },
): Promise<ClaimedCatalogueSync | null> {
  return sql.begin(async (tx) => {
    const sourceId = await ensureAnuSourceId(tx);
    const [row] = await tx`
      update public.catalogue_syncs as syncs
      set status = 'running', attempt_count = syncs.attempt_count + 1,
        lock_version = syncs.lock_version + 1, worker_id = ${workerId}::uuid,
        lease_expires_at = now() + make_interval(secs => ${leaseSeconds}),
        started_at = coalesce(syncs.started_at, now())
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      join public.academic_years as years on years.id = records.academic_year_id
      where syncs.id = ${syncId}::uuid and records.id = syncs.record_id
        and syncs.attempt_count < 5
        and (syncs.status = 'queued'
          or (syncs.status = 'running' and syncs.lease_expires_at < now()))
      returning syncs.id, records.kind, codes.code, years.year as academic_year,
        records.academic_year_id, records.id as record_id,
        syncs.previous_source_version_id, syncs.requested_model,
        syncs.parser_version, syncs.prompt_version, syncs.schema_version,
        syncs.attempt_count, syncs.lock_version
    `;
    if (!row) return null;
    return {
      syncId: String(row.id),
      kind: row.kind as CatalogueKind,
      code: String(row.code),
      academicYear: Number(row.academic_year),
      academicYearId: Number(row.academic_year_id),
      recordId: Number(row.record_id),
      previousSourceVersionId: numberOrNull(row.previous_source_version_id),
      requestedModel: String(row.requested_model),
      parserVersion: String(row.parser_version),
      promptVersion: String(row.prompt_version),
      schemaVersion: String(row.schema_version),
      sourceId,
      attemptCount: Number(row.attempt_count),
      lockVersion: Number(row.lock_version),
    };
  });
}

export async function getCatalogueSyncStatus(sql: AnySyncSql, syncId: string) {
  const [row] =
    await sql`select status from public.catalogue_syncs where id = ${syncId}::uuid`;
  return row ? String(row.status) : null;
}

export async function startSyncStage(
  sql: AnySyncSql,
  input: {
    syncId: string;
    stageName: SyncStageName;
    attemptNumber: number;
  },
) {
  const [row] = await sql`
    insert into public.catalogue_sync_stages (sync_id, stage_name, attempt_number)
    values (${input.syncId}::uuid, ${input.stageName}, ${input.attemptNumber})
    on conflict (sync_id, stage_name, attempt_number) do update set
      status = 'running', started_at = statement_timestamp(), completed_at = null,
      error_code = null, error_summary = null
    returning id
  `;
  return String(row.id);
}

export async function finishSyncStage(sql: AnySyncSql, stageId: string) {
  await sql`update public.catalogue_sync_stages set status = 'completed',
    completed_at = statement_timestamp() where id = ${stageId}::uuid`;
}

export async function failSyncStage(
  sql: AnySyncSql,
  input: {
    stageId: string;
    errorCode: string;
    errorSummary: string;
  },
) {
  await sql`update public.catalogue_sync_stages set status = 'failed',
    completed_at = statement_timestamp(), error_code = ${input.errorCode},
    error_summary = ${input.errorSummary} where id = ${input.stageId}::uuid`;
}

export type SyncArtifactRecord = SyncArtifactLocator & {
  id: string;
  kind: SyncArtifactKind;
};

export async function recordSyncArtifact(
  sql: AnySyncSql,
  input: {
    syncId: string;
    stageId: string;
    kind: SyncArtifactKind;
    attemptNumber: number;
    mediaType: string;
    contentSha256: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
  },
): Promise<SyncArtifactRecord> {
  const [row] = await sql`
    insert into public.catalogue_sync_artifacts (
      sync_id, stage_id, kind, attempt_number, media_type, content_sha256,
      byte_size, storage_bucket, storage_path
    ) values (${input.syncId}::uuid, ${input.stageId}::uuid, ${input.kind},
      ${input.attemptNumber}, ${input.mediaType}, ${input.contentSha256},
      ${input.byteSize}, ${input.storageBucket}, ${input.storagePath}) returning id
  `;
  return {
    id: String(row.id),
    kind: input.kind,
    bucket: input.storageBucket as SyncArtifactLocator["bucket"],
    path: input.storagePath,
    mediaType: input.mediaType,
    contentSha256: input.contentSha256,
    byteSize: input.byteSize,
  };
}

export async function recordSourceDocument(
  sql: AnySyncSql,
  input: {
    sourceId: number;
    recordId: number;
    academicYearId: number;
    kind: CatalogueKind;
    externalKey: string;
    canonicalUrl: string;
    contentSha256: string;
    httpStatus: number | null;
    httpEtag: string | null;
    sourceLastModified: string | null;
    fetchedAt: string;
    byteSize: number;
    storageBucket: string;
    storagePath: string;
  },
) {
  const [inserted] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key, canonical_url,
      content_sha256, http_status, http_etag, source_last_modified, fetched_at,
      byte_size, storage_bucket, storage_path
    ) values (${input.sourceId}, ${input.recordId}, ${input.academicYearId},
      ${input.kind}, ${input.externalKey}, ${input.canonicalUrl}, ${input.contentSha256},
      ${input.httpStatus}, ${input.httpEtag}, ${input.sourceLastModified},
      ${input.fetchedAt}, ${input.byteSize}, ${input.storageBucket}, ${input.storagePath})
    on conflict (source_id, record_id, content_sha256) do nothing
    returning id
  `;
  if (inserted) return Number(inserted.id);
  const [row] = await sql`
    select id from public.catalogue_source_documents
    where source_id = ${input.sourceId} and record_id = ${input.recordId}
      and content_sha256 = ${input.contentSha256}
  `;
  return Number(row.id);
}

export type ReusableExtraction = {
  id: string;
  syncId: string;
  responseArtifact: SyncArtifactLocator;
};

export async function findReusableExtraction(
  sql: AnySyncSql,
  fingerprint: string,
) {
  const [row] = await sql`
    select extractions.id, extractions.sync_id, artifacts.media_type,
      artifacts.content_sha256, artifacts.byte_size, artifacts.storage_bucket,
      artifacts.storage_path
    from public.catalogue_extractions as extractions
    join public.catalogue_sync_artifacts as artifacts
      on artifacts.id = extractions.response_artifact_id
    where extractions.fingerprint = ${fingerprint}
      and extractions.validation_status = 'valid'
      and extractions.completed_at is not null
    order by extractions.completed_at desc limit 1
  `;
  if (!row) return null;
  return {
    id: String(row.id),
    syncId: String(row.sync_id),
    responseArtifact: {
      bucket: row.storage_bucket as SyncArtifactLocator["bucket"],
      path: String(row.storage_path),
      mediaType: String(row.media_type),
      contentSha256: String(row.content_sha256),
      byteSize: Number(row.byte_size),
    },
  } satisfies ReusableExtraction;
}

export async function reserveExtraction(
  sql: AnySyncSql,
  input: {
    syncId: string;
    extractionNumber: number;
    requestedModel: string;
    fingerprint: string;
    promptVersion: string;
    schemaVersion: string;
    requestArtifactId: string;
  },
) {
  const [existing] =
    await sql`select id, response_artifact_id from public.catalogue_extractions
    where sync_id = ${input.syncId}::uuid and fingerprint = ${input.fingerprint}
    order by started_at desc limit 1`;
  if (existing)
    return {
      id: String(existing.id),
      created: false,
      responseArtifactId: existing.response_artifact_id
        ? String(existing.response_artifact_id)
        : null,
    };
  const [row] = await sql`insert into public.catalogue_extractions (
    sync_id, extraction_number, requested_model, fingerprint, prompt_version,
    schema_version, request_artifact_id
  ) values (${input.syncId}::uuid, ${input.extractionNumber}, ${input.requestedModel},
    ${input.fingerprint}, ${input.promptVersion}, ${input.schemaVersion},
    ${input.requestArtifactId}::uuid) returning id`;
  return { id: String(row.id), created: true, responseArtifactId: null };
}

export async function attachExtractionResponse(
  sql: AnySyncSql,
  input: Record<string, unknown> & {
    extractionId: string;
    responseArtifactId: string;
  },
) {
  await sql`update public.catalogue_extractions set
    response_artifact_id = ${input.responseArtifactId}::uuid,
    resolved_model = ${input.resolvedModel as string},
    reused_from_extraction_id = ${input.reusedFromExtractionId as string | null}::uuid,
    provider_request_id = ${input.providerRequestId as string | null},
    finish_reason = ${input.finishReason as string | null},
    input_tokens = ${input.inputTokens as number},
    cached_input_tokens = ${input.cachedInputTokens as number},
    output_tokens = ${input.outputTokens as number},
    reasoning_tokens = ${input.reasoningTokens as number},
    cost_usd = ${input.costUsd as number}, cost_source = ${input.costSource as string},
    latency_ms = ${Math.round(input.latencyMs as number)}
    where id = ${input.extractionId}::uuid`;
}

export async function completeExtraction(
  sql: AnySyncSql,
  input: Record<string, unknown> & {
    extractionId: string;
  },
) {
  const valid = Boolean(input.schemaValid) && Boolean(input.domainValid);
  await sql`update public.catalogue_extractions set
    validated_artifact_id = ${input.validatedArtifactId as string | null}::uuid,
    validation_status = ${valid ? "valid" : "invalid"},
    schema_valid = ${Boolean(input.schemaValid)}, domain_valid = ${Boolean(input.domainValid)},
    warning_count = ${input.warningCount as number}, error_count = ${input.errorCount as number},
    error_summary = ${input.errorSummary as string | null}, completed_at = now()
    where id = ${input.extractionId}::uuid`;
}

function assertLeaseHeld(count: number) {
  if (count !== 1)
    throw new SyncStoreError(
      "The catalogue sync lease was lost before its result could be recorded.",
      "LEASE_LOST",
    );
}

export async function finishCatalogueSync(
  sql: SyncSql,
  input: {
    syncId: string;
    workerId: string;
    expectedLockVersion: number;
    status: "unchanged" | "review_required" | "applied" | "failed";
    sourceDocumentId: number | null;
    sourceVersionId: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  const rows = await sql.begin(async (tx) => {
    const finished =
      await tx`update public.catalogue_syncs set status = ${input.status},
    source_document_id = ${input.sourceDocumentId}, source_version_id = ${input.sourceVersionId},
    checked_at = case when ${input.status} <> 'failed' then now() else checked_at end,
    completed_at = now(), worker_id = null, lease_expires_at = null,
    error_code = ${input.errorCode ?? null}, error_message = ${input.errorMessage ?? null}
    where id = ${input.syncId}::uuid and status = 'running'
      and worker_id = ${input.workerId}::uuid and lock_version = ${input.expectedLockVersion}
    returning id, record_id, requested_by`;
    if (finished.length === 1 && input.status === "failed") {
      await tx`insert into public.catalogue_change_events (
        record_id, event_kind, origin, actor_id
      ) values (${finished[0].record_id}, 'sync_failed', 'source', ${finished[0].requested_by})`;
    }
    return finished;
  });
  assertLeaseHeld(rows.length);
}

export async function releaseCatalogueSyncForRetry(
  sql: SyncSql,
  input: {
    syncId: string;
    workerId: string;
    expectedLockVersion: number;
    errorCode: string;
    errorMessage: string;
  },
) {
  const rows = await sql`update public.catalogue_syncs set status = 'queued',
    worker_id = null, lease_expires_at = null, error_code = ${input.errorCode},
    error_message = ${input.errorMessage}
    where id = ${input.syncId}::uuid and status = 'running'
      and worker_id = ${input.workerId}::uuid and lock_version = ${input.expectedLockVersion}
    returning id`;
  assertLeaseHeld(rows.length);
}

export async function recordSyncDispatch(
  sql: SyncSql,
  input: {
    syncId: string;
    messageId: string | null;
    errorMessage?: string;
  },
) {
  if (input.errorMessage) {
    const errorMessage = input.errorMessage;
    await sql.begin(async (tx) => {
      const [failed] =
        await tx`update public.catalogue_syncs set status = 'failed',
        error_code = 'QUEUE_DISPATCH_FAILED', error_message = ${errorMessage},
        completed_at = now() where id = ${input.syncId}::uuid and status = 'queued'
        returning record_id, requested_by`;
      if (failed) {
        await tx`insert into public.catalogue_change_events (
          record_id, event_kind, origin, actor_id
        ) values (${failed.record_id}, 'sync_failed', 'source', ${failed.requested_by})`;
      }
    });
  } else {
    await sql`update public.catalogue_syncs set dispatched_at = coalesce(dispatched_at, now()),
      queue_message_id = coalesce(queue_message_id, ${input.messageId})
      where id = ${input.syncId}::uuid and status = 'queued'`;
  }
}
