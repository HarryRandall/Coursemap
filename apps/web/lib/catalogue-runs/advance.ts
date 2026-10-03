import { withSyncDatabaseClient } from "../catalogue-sync/sync-store.ts";
import { dispatchCatalogueSync } from "../catalogue-sync/sync-queue.ts";

/** A lease marker prevents two browsers or queue callbacks advancing one run twice. */
export async function advanceCourseRun(runId: string) {
  const item = await withSyncDatabaseClient((sql) =>
    sql.begin(async (tx) => {
      const [run] =
        await tx`select id from public.catalogue_course_runs where id = ${runId}::uuid and state = 'active' for update`;
      if (!run) return null;
      await tx`update public.catalogue_syncs set status = 'queued', worker_id = null, lease_expires_at = null, dispatched_at = null, lock_version = lock_version + 1
        where id in (select sync_id from public.catalogue_course_run_items where run_id = ${runId}::uuid)
          and status = 'running' and lease_expires_at < now() and retry_count < 5`;
      const [busy] =
        await tx`select 1 from public.catalogue_course_run_items items join public.catalogue_syncs syncs on syncs.id = items.sync_id where items.run_id = ${runId}::uuid and (syncs.status = 'running' or (syncs.status = 'queued' and syncs.dispatched_at > now() - interval '10 minutes'))`;
      if (busy) return null;
      const [row] =
        await tx`select syncs.id from public.catalogue_course_run_items items join public.catalogue_syncs syncs on syncs.id = items.sync_id where items.run_id = ${runId}::uuid and syncs.status = 'queued' and (syncs.dispatched_at is null or syncs.dispatched_at < now() - interval '10 minutes') order by items.record_id limit 1 for update of syncs`;
      if (!row) return null;
      await tx`update public.catalogue_syncs set dispatched_at = now() where id = ${row.id}::uuid`;
      return String(row.id);
    }),
  );
  return item
    ? { syncId: item, ...(await dispatchCatalogueSync({ syncId: item })) }
    : null;
}
