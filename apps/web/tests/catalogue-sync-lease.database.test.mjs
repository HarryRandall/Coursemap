import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, test } from "vitest";

import { emptyCatalogueContent } from "../lib/catalogue/content.ts";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content.ts";
import {
  persistSourceVersion,
  persistSourceVersionAndFinishSync,
} from "../lib/catalogue-sync/persist-source-version.ts";
import {
  claimCatalogueSync,
  ensureAnuSourceId,
  failAbandonedCatalogueSync,
} from "../lib/catalogue-sync/sync-store.ts";
import { sweepCatalogueSyncs } from "../lib/catalogue-sync/sync-sweeper.ts";
import { advanceCourseRun } from "../lib/catalogue-runs/advance.ts";
import { cancelCourseRun } from "../lib/catalogue-runs/service.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const YEAR = 2026;
const MODEL = "google/gemini-3.1-flash-lite";
const WORKER = "99000000-0000-4000-8000-000000000081";
const NEXT_WORKER = "99000000-0000-4000-8000-000000000082";
let sql;
let userId;
let yearId;
let sourceId;
const codes = [];
const runIds = [];

async function removeFixtures() {
  if (codes.length === 0) return;
  await sql`delete from public.catalogue_course_run_items where run_id = any(${sql.array(runIds)}::uuid[])`;
  await sql`delete from public.catalogue_course_runs where id = any(${sql.array(runIds)}::uuid[])`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code in ${sql(codes)}`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
    await sql`alter table public.catalogue_source_documents enable trigger catalogue_source_documents_reject_mutation`;
  }
}

async function createRecord() {
  const code = `TSTL${9900 + codes.length}`;
  codes.push(code);
  const [identity] =
    await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
  const [record] =
    await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${yearId}) returning id`;
  return { code, recordId: Number(record.id) };
}

async function createSync(recordId, { retryCount = 0, agedMinutes = 0 } = {}) {
  const [sync] = await sql`insert into public.catalogue_syncs (
      record_id, trigger, requested_model, parser_version, prompt_version,
      schema_version, retry_count, requested_by, updated_at
    ) values (${recordId}, 'manual', ${MODEL}, 'test-parser', 'test-prompt',
      'test-schema', ${retryCount}, ${userId}::uuid,
      now() - make_interval(mins => ${agedMinutes}))
    returning id`;
  return String(sync.id);
}

async function createRun(syncs) {
  const [run] =
    await sql`insert into public.catalogue_course_runs (academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million) values (${YEAR}, ${userId}::uuid, ${MODEL}, ${syncs.length}, 0.5, 0.25, 1.5) returning id`;
  runIds.push(run.id);
  for (const { recordId, syncId } of syncs)
    await sql`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${run.id}::uuid, ${recordId}, ${syncId}::uuid)`;
  return String(run.id);
}

async function expireLease(syncId) {
  await sql`update public.catalogue_syncs set lease_expires_at = now() - interval '1 second' where id = ${syncId}::uuid`;
}

async function syncRow(syncId) {
  const [row] =
    await sql`select status, worker_id, error_code, lock_version from public.catalogue_syncs where id = ${syncId}::uuid`;
  return row;
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
    COURSEMAP_QUEUE_SYNCS_ENABLED: "false",
  });
  sql = await createLocalDatabaseClient();
  const [user] =
    await sql`insert into auth.users (id) values (${randomUUID()}::uuid) returning id`;
  userId = user.id;
  [{ id: yearId }] =
    await sql`select id from public.academic_years where year = ${YEAR}`;
  sourceId = await ensureAnuSourceId(sql);
});

afterAll(async () => {
  if (!sql) return;
  await removeFixtures();
  if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end({ timeout: 5 });
});

test("a worker whose lease was taken over writes nothing", async () => {
  const { code, recordId } = await createRecord();
  const syncId = await createSync(recordId);
  const stale = await claimCatalogueSync(sql, { syncId, workerId: WORKER });
  await expireLease(syncId);
  const current = await claimCatalogueSync(sql, {
    syncId,
    workerId: NEXT_WORKER,
  });
  assert.equal(current.lockVersion, stale.lockVersion + 1);

  const contentSha256 = "f".repeat(64);
  const [document] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key,
      canonical_url, content_sha256, http_status, fetched_at
    ) values (
      ${sourceId}, ${recordId}, ${yearId}, 'course', ${code},
      ${`https://programsandcourses.anu.edu.au/${YEAR}/course/${code}`},
      ${contentSha256}, 200, now()
    ) returning id
  `;
  const write = emptyCatalogueContent({
    kind: "course",
    code,
    academicYear: YEAR,
    title: "Lease Test",
  });
  write.course.details.description = "Read by the worker that lost its lease.";
  write.contentHash = contentHashForCatalogueContent(write);
  const input = { sourceDocumentId: Number(document.id), write };

  for (const persist of [
    persistSourceVersion,
    persistSourceVersionAndFinishSync,
  ]) {
    await assert.rejects(persist(sql, { ...input, claim: stale }), {
      code: "LEASE_LOST",
    });
  }
  const [written] = await sql`select
      (select count(*)::int from public.catalogue_versions where record_id = ${recordId}) as versions,
      (select count(*)::int from public.catalogue_drafts where record_id = ${recordId}) as drafts,
      (select count(*)::int from public.catalogue_change_events where record_id = ${recordId}) as events,
      (select count(*)::int from public.catalogue_sync_changes where record_id = ${recordId}) as changes`;
  assert.deepEqual(
    { ...written },
    { versions: 0, drafts: 0, events: 0, changes: 0 },
  );
  const held = await syncRow(syncId);
  assert.equal(held.status, "running");
  assert.equal(held.worker_id, NEXT_WORKER);

  const result = await persistSourceVersionAndFinishSync(sql, {
    ...input,
    claim: current,
  });
  assert.equal(result.status, "applied");
  const finished = await syncRow(syncId);
  assert.equal(finished.status, "applied");
  assert.equal(finished.worker_id, null);
});

test("a run advance fails a final attempt whose worker stopped", async () => {
  const exhausted = await createRecord();
  const exhaustedSync = await createSync(exhausted.recordId, { retryCount: 4 });
  const retryable = await createRecord();
  const retryableSync = await createSync(retryable.recordId);
  const runId = await createRun([
    { recordId: exhausted.recordId, syncId: exhaustedSync },
    { recordId: retryable.recordId, syncId: retryableSync },
  ]);
  for (const syncId of [exhaustedSync, retryableSync]) {
    await claimCatalogueSync(sql, { syncId, workerId: WORKER });
    await expireLease(syncId);
  }

  await advanceCourseRun(runId);

  const failed = await syncRow(exhaustedSync);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error_code, "LEASE_EXPIRED");
  const [event] =
    await sql`select event_kind from public.catalogue_change_events where record_id = ${exhausted.recordId}`;
  assert.equal(event.event_kind, "sync_failed");
  // A sync with attempts left is requeued and dispatched again instead.
  assert.equal((await syncRow(retryableSync)).status, "queued");
});

test("cancelling a run stops a running sync whose worker stopped", async () => {
  const stopped = await createRecord();
  const stoppedSync = await createSync(stopped.recordId);
  const live = await createRecord();
  const liveSync = await createSync(live.recordId);
  const runId = await createRun([
    { recordId: stopped.recordId, syncId: stoppedSync },
    { recordId: live.recordId, syncId: liveSync },
  ]);
  const stoppedClaim = await claimCatalogueSync(sql, {
    syncId: stoppedSync,
    workerId: WORKER,
  });
  await claimCatalogueSync(sql, { syncId: liveSync, workerId: NEXT_WORKER });
  await expireLease(stoppedSync);

  await cancelCourseRun(runId);

  const cancelled = await syncRow(stoppedSync);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.worker_id, null);
  assert.ok(cancelled.lock_version > stoppedClaim.lockVersion);
  // A worker that is still alive finishes or fails its own sync.
  assert.equal((await syncRow(liveSync)).status, "running");
  await sql`update public.catalogue_syncs set status = 'cancelled', completed_at = now() where id = ${liveSync}::uuid`;
});

test("an undeliverable sync fails only when no worker can still hold it", async () => {
  const queued = await createRecord();
  const queuedSync = await createSync(queued.recordId);
  const running = await createRecord();
  const runningSync = await createSync(running.recordId);
  await claimCatalogueSync(sql, { syncId: runningSync, workerId: WORKER });
  const input = {
    errorCode: "QUEUE_EXHAUSTED",
    errorMessage: "The queue stopped delivering this sync.",
  };

  assert.equal(
    await failAbandonedCatalogueSync(sql, { ...input, syncId: queuedSync }),
    true,
  );
  assert.equal((await syncRow(queuedSync)).error_code, "QUEUE_EXHAUSTED");
  assert.equal(
    await failAbandonedCatalogueSync(sql, { ...input, syncId: runningSync }),
    false,
  );
  assert.equal((await syncRow(runningSync)).status, "running");
  await expireLease(runningSync);
  assert.equal(
    await failAbandonedCatalogueSync(sql, { ...input, syncId: runningSync }),
    true,
  );
});

test("the sweep redispatches a stranded sync but leaves run items to their run", async () => {
  const stranded = await createRecord();
  const strandedSync = await createSync(stranded.recordId, { agedMinutes: 30 });
  const recent = await createRecord();
  const recentSync = await createSync(recent.recordId);
  const waiting = await createRecord();
  const waitingSync = await createSync(waiting.recordId, { agedMinutes: 30 });
  const runId = await createRun([
    { recordId: waiting.recordId, syncId: waitingSync },
  ]);
  const dispatched = [];

  await sweepCatalogueSyncs({
    queueEnabled: true,
    dispatch: async (sync) => {
      dispatched.push(sync);
      return { mode: "queue" };
    },
  });

  const ids = dispatched.map(({ syncId }) => syncId);
  assert.ok(
    dispatched.some(
      ({ syncId, generation }) => syncId === strandedSync && generation === 0,
    ),
  );
  assert.ok(!ids.includes(recentSync));
  assert.ok(!ids.includes(waitingSync));
  await cancelCourseRun(runId);
  await sql`update public.catalogue_syncs set status = 'cancelled', completed_at = now() where id in (${strandedSync}::uuid, ${recentSync}::uuid)`;
});
