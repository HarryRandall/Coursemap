import "server-only";

import { SyncStoreError, type SyncSql } from "./sync-store.ts";
import type {
  CatalogueProviderPause,
  CatalogueProviderPauseReason,
} from "./provider-pause.ts";

export async function readCatalogueProviderControl(
  sql: SyncSql,
): Promise<{ revision: number; pause: CatalogueProviderPause | null }> {
  const [control] =
    await sql`select paused, revision, pause_reason, error_message
    from public.catalogue_provider_controls where provider = 'openrouter'`;
  if (!control)
    throw new SyncStoreError(
      "The provider control is missing.",
      "PROVIDER_CONTROL_MISSING",
    );
  return {
    revision: Number(control.revision),
    pause: control.paused
      ? {
          reason: control.pause_reason as CatalogueProviderPauseReason,
          message: String(control.error_message),
        }
      : null,
  };
}

export async function readCatalogueProviderPause(sql: SyncSql) {
  return (await readCatalogueProviderControl(sql)).pause;
}

export async function holdQueuedSyncWhenProviderPaused(
  sql: SyncSql,
  syncId: string,
) {
  const rows = await sql`update public.catalogue_syncs as syncs
    set status = 'paused', worker_id = null, lease_expires_at = null,
        lock_version = lock_version + 1, error_code = 'OPENROUTER_PROVIDER_PAUSED',
        error_message = controls.error_message
    from public.catalogue_provider_controls as controls
    where controls.provider = 'openrouter' and controls.paused
      and syncs.id = ${syncId}::uuid
      and (syncs.status = 'queued' or (syncs.status = 'running' and syncs.lease_expires_at < now()))
    returning syncs.id`;
  return rows.length === 1;
}

export async function pauseCatalogueProviderAndSync(
  sql: SyncSql,
  input: {
    syncId: string;
    workerId: string;
    expectedLockVersion: number;
    expectedProviderRevision: number;
    pause: CatalogueProviderPause;
    errorCode: string;
    sourceDocumentId: number | null;
  },
) {
  await sql.begin(async (tx) => {
    // Resume and pause lock the provider before jobs, so their order is stable.
    const [control] =
      await tx`select paused, revision from public.catalogue_provider_controls
      where provider = 'openrouter' for update`;
    if (!control)
      throw new SyncStoreError(
        "The provider control is missing.",
        "PROVIDER_CONTROL_MISSING",
      );
    const held = await tx`update public.catalogue_syncs
      set status = 'paused', worker_id = null, lease_expires_at = null,
          source_document_id = coalesce(${input.sourceDocumentId}, source_document_id),
          error_code = ${input.errorCode}, error_message = ${input.pause.message}, completed_at = null
      where id = ${input.syncId}::uuid and status = 'running'
        and worker_id = ${input.workerId}::uuid and lock_version = ${input.expectedLockVersion}
      returning id`;
    if (held.length !== 1)
      throw new SyncStoreError(
        "The catalogue worker lease was lost.",
        "SYNC_LEASE_LOST",
      );
    if (
      !control.paused &&
      Number(control.revision) === input.expectedProviderRevision
    ) {
      await tx`update public.catalogue_provider_controls
        set paused = true, revision = revision + 1, paused_at = now(),
            pause_reason = ${input.pause.reason}, error_message = ${input.pause.message},
            source_sync_id = ${input.syncId}::uuid
        where provider = 'openrouter'`;
    }
    await tx`update public.catalogue_syncs
      set status = 'paused', error_code = 'OPENROUTER_PROVIDER_PAUSED', error_message = ${input.pause.message}
      where status = 'queued' and exists (
        select 1 from public.catalogue_provider_controls where provider = 'openrouter' and paused
      )`;
  });
}

export async function catalogueSyncDispatchAllowed(
  sql: SyncSql,
  input: { syncId: string; generation: number },
) {
  return sql.begin(async (tx) => {
    const [control] =
      await tx`select paused, error_message from public.catalogue_provider_controls
      where provider = 'openrouter' for update`;
    if (!control)
      throw new SyncStoreError(
        "The provider control is missing.",
        "PROVIDER_CONTROL_MISSING",
      );
    const [sync] =
      await tx`select status, dispatch_generation from public.catalogue_syncs
      where id = ${input.syncId}::uuid for update`;
    if (
      !sync ||
      sync.status !== "queued" ||
      Number(sync.dispatch_generation) !== input.generation
    )
      return false;
    if (control.paused) {
      await tx`update public.catalogue_syncs set status = 'paused',
        error_code = 'OPENROUTER_PROVIDER_PAUSED', error_message = ${control.error_message}
        where id = ${input.syncId}::uuid`;
      return false;
    }
    return true;
  });
}

export async function holdCatalogueSyncAfterDispatchFailure(
  sql: SyncSql,
  input: {
    syncId: string;
    generation: number;
    errorMessage: string;
  },
) {
  await sql`update public.catalogue_syncs set status = 'paused',
    error_code = 'QUEUE_DISPATCH_FAILED', error_message = ${input.errorMessage},
    dispatched_at = null, queue_message_id = null
    where id = ${input.syncId}::uuid and status = 'queued'
      and dispatch_generation = ${input.generation}`;
}
