import {
  failExhaustedExpiredSyncs,
  withSyncDatabaseClient,
  type SyncSql,
} from "./sync-store.ts";
import { dispatchCatalogueSync, syncQueueEnabled } from "./sync-queue.ts";
import { safeErrorSummary } from "./process-sync.ts";
import { advanceCourseRun } from "../catalogue-runs/advance.ts";

/** A queued sync gets this long to be dispatched by the request that started it. */
export const UNDISPATCHED_SYNC_GRACE_MINUTES = 5;
const SWEEP_DISPATCH_LIMIT = 25;

type DispatchSync = typeof dispatchCatalogueSync;
type AdvanceRun = (runId: string) => Promise<unknown>;

/** Active runs that still have queued or running items. */
async function readUnfinishedRuns(sql: SyncSql) {
  const rows =
    await sql`select runs.id from public.catalogue_course_runs as runs
    where runs.state = 'active' and exists (
      select 1 from public.catalogue_course_run_items as items
      join public.catalogue_syncs as syncs on syncs.id = items.sync_id
      where items.run_id = runs.id and syncs.status in ('queued', 'running'))
    order by runs.created_at limit ${SWEEP_DISPATCH_LIMIT}`;
  return rows.map((row) => String(row.id));
}

/**
 * Queued syncs whose queue message was never recorded as sent, outside a
 * run. Run items wait for their turn undispatched and are advanced by the
 * run, so they are excluded.
 */
async function readUndispatchedSyncs(sql: SyncSql) {
  const rows = await sql`select syncs.id, syncs.dispatch_generation
    from public.catalogue_syncs as syncs
    where syncs.status = 'queued' and syncs.dispatched_at is null
      and syncs.updated_at < now() - make_interval(mins => ${UNDISPATCHED_SYNC_GRACE_MINUTES})
      and not exists (select 1 from public.catalogue_course_run_items as items where items.sync_id = syncs.id)
    order by syncs.updated_at limit ${SWEEP_DISPATCH_LIMIT}`;
  return rows.map((row) => ({
    syncId: String(row.id),
    generation: Number(row.dispatch_generation),
  }));
}

/**
 * Repairs syncs that nothing else will finish: running syncs whose final
 * lease expired are failed, and queued syncs whose dispatch never completed
 * are sent again under the same idempotency key, so a message that did reach
 * the queue is not delivered twice. In queue mode every unfinished run is
 * also advanced, in case the worker that should have advanced it stopped;
 * an advance is serialised on the run and does nothing while it is busy.
 */
export async function sweepCatalogueSyncs({
  dispatch = dispatchCatalogueSync,
  advance = advanceCourseRun,
  queueEnabled = syncQueueEnabled(),
}: {
  dispatch?: DispatchSync;
  advance?: AdvanceRun;
  queueEnabled?: boolean;
} = {}) {
  const { expired, undispatched, runs } = await withSyncDatabaseClient(
    async (sql) => ({
      expired: await failExhaustedExpiredSyncs(sql, "all"),
      // Inline syncs and runs are driven by the request or browser that
      // started them.
      undispatched: queueEnabled ? await readUndispatchedSyncs(sql) : [],
      runs: queueEnabled ? await readUnfinishedRuns(sql) : [],
    }),
  );
  let redispatched = 0;
  const errors: string[] = [];
  for (const sync of undispatched) {
    try {
      const result = await dispatch(sync);
      if (result.mode === "queue") redispatched += 1;
    } catch (error) {
      // dispatchCatalogueSync has already recorded the failure on the sync.
      errors.push(safeErrorSummary(error));
    }
  }
  let advancedRuns = 0;
  for (const runId of runs) {
    try {
      await advance(runId);
      advancedRuns += 1;
    } catch (error) {
      errors.push(safeErrorSummary(error));
    }
  }
  return { failedExpired: expired.length, redispatched, advancedRuns, errors };
}
