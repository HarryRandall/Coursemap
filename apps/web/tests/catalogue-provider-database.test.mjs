import assert from "node:assert/strict";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import {
  claimCatalogueSync,
  recordSyncDispatch,
} from "../lib/catalogue-sync/sync-store.ts";
import { processCatalogueSync } from "../lib/catalogue-sync/process-sync.ts";
import {
  catalogueSyncDispatchAllowed,
  holdCatalogueSyncAfterDispatchFailure,
  pauseCatalogueProviderAndSync,
} from "../lib/catalogue-sync/provider-store.ts";

const ADMIN = "99000000-0000-4000-8000-000000000071";
const OTHER = "99000000-0000-4000-8000-000000000072";
const WORKER = "99000000-0000-4000-8000-000000000073";
const NEXT_WORKER = "99000000-0000-4000-8000-000000000074";
const CODES = ["TSTP9910", "TSTP9911"];
let sql, originalControl;
const records = [];

async function asUser(
  work,
  user = ADMIN,
  client = sql,
  role = "authenticated",
) {
  return client.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${user}, true)`;
    if (role === "anon") await tx`set local role anon`;
    else await tx`set local role authenticated`;
    return work(tx);
  });
}
async function recover(revision, resume, limit = 1, client = sql) {
  const [row] = await asUser(
    (tx) =>
      tx`select public.resume_catalogue_provider(${revision}, ${resume}, ${limit}) as result`,
    ADMIN,
    client,
  );
  return row.result;
}
async function sync(recordId) {
  const [row] =
    await sql`insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version) values (${recordId}, 'manual', (select id from public.import_models where enabled order by id limit 1), 'test', 'test', 'test') returning id`;
  return row.id;
}
async function pause(
  claim,
  worker = WORKER,
  providerRevision = claim.providerRevision,
) {
  await pauseCatalogueProviderAndSync(sql, {
    syncId: claim.syncId,
    workerId: worker,
    expectedLockVersion: claim.lockVersion,
    expectedProviderRevision: providerRevision,
    pause: {
      reason: "key_limit",
      message: "Key limit exceeded (total limit).",
    },
    errorCode: "OPENROUTER_HTTP_403",
    sourceDocumentId: null,
  });
}
async function control() {
  return (
    await sql`select * from public.catalogue_provider_controls where provider = 'openrouter'`
  )[0];
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
    COURSEMAP_QUEUE_SYNCS_ENABLED: "false",
  });
  sql = await createLocalDatabaseClient();
  originalControl = await control();
  for (const id of [ADMIN, OTHER]) {
    await sql`insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', ${id}::uuid, 'authenticated', 'authenticated', ${`${id}@example.test`}, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()) on conflict (id) do nothing`;
  }
  await sql`insert into private.user_roles (user_id, role_id) select ${ADMIN}::uuid, id from private.app_roles where key = 'admin' on conflict (user_id) do update set role_id = excluded.role_id`;
  const [year] =
    await sql`select id from public.academic_years where year = 2026`;
  for (const code of CODES) {
    const [identity] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
    const [record] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${year.id}) returning id`;
    records.push(Number(record.id));
  }
});
beforeEach(async () => {
  await sql`delete from public.catalogue_syncs where record_id in ${sql(records)}`;
  await sql`update public.catalogue_provider_controls set paused = false, revision = 0, paused_at = null, pause_reason = null, error_message = null, source_sync_id = null, resumed_at = null, resumed_by = null where provider = 'openrouter'`;
});
afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.catalogue_codes where code in ${sql(CODES)}`;
  if (originalControl)
    await sql`update public.catalogue_provider_controls set paused = ${originalControl.paused}, revision = ${originalControl.revision}, paused_at = ${originalControl.paused_at}, pause_reason = ${originalControl.pause_reason}, error_message = ${originalControl.error_message}, source_sync_id = ${originalControl.source_sync_id}, resumed_at = ${originalControl.resumed_at}, resumed_by = ${originalControl.resumed_by} where provider = 'openrouter'`;
  await sql`delete from auth.users where id in (${ADMIN}::uuid, ${OTHER}::uuid)`;
  await sql.end();
});

test("a shared pause holds all queued work and guarded recovery survives interrupted dispatch", async () => {
  const firstId = await sync(records[0]);
  const secondId = await sync(records[1]);
  const claim = await claimCatalogueSync(sql, {
    syncId: firstId,
    workerId: WORKER,
  });
  await pause(claim);
  assert.equal((await control()).paused, true);
  assert.equal((await control()).revision, 1);
  const paused =
    await sql`select id, status, attempt_count from public.catalogue_syncs where id in (${firstId}::uuid, ${secondId}::uuid)`;
  assert.ok(paused.every((row) => row.status === "paused"));
  assert.equal(
    await claimCatalogueSync(sql, { syncId: secondId, workerId: NEXT_WORKER }),
    null,
  );
  await processCatalogueSync({ syncId: secondId });
  const [untouched] =
    await sql`select attempt_count from public.catalogue_syncs where id = ${secondId}::uuid`;
  assert.equal(untouched.attempt_count, 0);
  await assert.rejects(
    asUser(
      (tx) =>
        tx`select public.start_catalogue_sync(${records[0]}, 'manual', (select id from public.import_models where enabled order by id limit 1), 'test', 'test', 'test')`,
    ),
    (error) => error.code === "55000",
  );

  const otherSql = await createLocalDatabaseClient();
  let recovered;
  try {
    const attempts = await Promise.allSettled([
      recover(1, true),
      recover(1, true, 1, otherSql),
    ]);
    assert.equal(
      attempts.filter((attempt) => attempt.status === "fulfilled").length,
      1,
    );
    const failed = attempts.find((attempt) => attempt.status === "rejected");
    assert.equal(failed.reason.code, "40001");
    recovered = attempts.find(
      (attempt) => attempt.status === "fulfilled",
    ).value;
  } finally {
    await otherSql.end();
  }
  assert.equal(recovered.revision, 2);
  assert.equal(recovered.remainingPaused, 1);
  const recoveredId = recovered.syncs[0].id;
  const [preserved] =
    await sql`select attempt_count, retry_count, dispatch_generation from public.catalogue_syncs where id = ${recoveredId}::uuid`;
  assert.equal(preserved.attempt_count, recoveredId === firstId ? 1 : 0);
  assert.equal(preserved.retry_count, 0);
  assert.equal(preserved.dispatch_generation, 1);

  // Recover the committed batch again when its process stopped before dispatch.
  const interrupted = await recover(2, false);
  assert.equal(interrupted.syncs[0].id, recoveredId);
  assert.equal(interrupted.syncs[0].generation, 2);
  assert.equal(
    await catalogueSyncDispatchAllowed(sql, {
      syncId: recoveredId,
      generation: 1,
    }),
    false,
  );
  assert.equal(
    await catalogueSyncDispatchAllowed(sql, {
      syncId: recoveredId,
      generation: 2,
    }),
    true,
  );
  await recordSyncDispatch(sql, {
    syncId: recoveredId,
    generation: 2,
    messageId: "new-generation",
  });
  const remainder = await recover(2, false);
  assert.equal(remainder.remainingPaused, 0);
  const remainingId = remainder.syncs[0].id;
  await holdCatalogueSyncAfterDispatchFailure(sql, {
    syncId: remainingId,
    generation: 1,
    errorMessage: "Queue unavailable.",
  });
  const [held] =
    await sql`select status from public.catalogue_syncs where id = ${remainingId}::uuid`;
  assert.equal(held.status, "paused");
  const recordId = remainingId === firstId ? records[0] : records[1];
  await assert.rejects(sync(recordId), (error) => error.code === "23505");
  const [cancelled] = await asUser(
    (tx) =>
      tx`select public.cancel_catalogue_sync(${remainingId}::uuid) as cancelled`,
  );
  assert.equal(cancelled.cancelled, true);
});

test("a late rejection from an older provider revision cannot pause resumed work", async () => {
  const firstId = await sync(records[0]);
  const nextId = await sync(records[1]);
  const oldClaim = await claimCatalogueSync(sql, {
    syncId: firstId,
    workerId: WORKER,
  });
  await sql`update public.catalogue_provider_controls set paused = true, revision = 1, paused_at = now(), pause_reason = 'key_limit', error_message = 'Previous limit.' where provider = 'openrouter'`;
  await sql`update public.catalogue_syncs set status = 'paused' where id = ${nextId}::uuid`;
  await recover(1, true);
  await pause(oldClaim);
  assert.equal((await control()).paused, false);
  assert.equal((await control()).revision, 2);
  const [next] =
    await sql`select status from public.catalogue_syncs where id = ${nextId}::uuid`;
  assert.equal(next.status, "queued");
  const current = await claimCatalogueSync(sql, {
    syncId: nextId,
    workerId: NEXT_WORKER,
  });
  assert.equal(current.providerRevision, 2);
});

test("a lost worker lease cannot pause the provider, and administrator recovery preserves attempt history", async () => {
  const syncId = await sync(records[0]);
  const oldClaim = await claimCatalogueSync(sql, { syncId, workerId: WORKER });
  await sql`update public.catalogue_syncs set lease_expires_at = now() - interval '1 second' where id = ${syncId}::uuid`;
  const current = await claimCatalogueSync(sql, {
    syncId,
    workerId: NEXT_WORKER,
  });
  await assert.rejects(
    pause(oldClaim),
    (error) => error.code === "SYNC_LEASE_LOST",
  );
  assert.equal((await control()).paused, false);
  await pause(current, NEXT_WORKER);
  await recover(1, true);
  const next = await claimCatalogueSync(sql, { syncId, workerId: WORKER });
  assert.equal(next.attemptCount, 3);
  assert.equal(next.retryCount, 1);
});

test("provider controls are readable and resumable only with import permission", async () => {
  assert.equal(
    (
      await asUser(
        (tx) => tx`select provider from public.catalogue_provider_controls`,
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await asUser(
        (tx) => tx`select provider from public.catalogue_provider_controls`,
        OTHER,
      )
    ).length,
    0,
  );
  await assert.rejects(
    asUser(
      (tx) => tx`update public.catalogue_provider_controls set paused = false`,
    ),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    asUser(
      (tx) => tx`select public.resume_catalogue_provider(0, false, 1)`,
      OTHER,
    ),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    asUser(
      (tx) => tx`select provider from public.catalogue_provider_controls`,
      OTHER,
      sql,
      "anon",
    ),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    asUser((tx) => tx`select public.resume_catalogue_provider(0, false, 26)`),
    (error) => error.code === "22023",
  );
});

test("automatic retries remain bounded after historical attempts are preserved", async () => {
  const syncId = await sync(records[0]);
  await sql`update public.catalogue_syncs set attempt_count = 12, retry_count = 4 where id = ${syncId}::uuid`;
  const last = await claimCatalogueSync(sql, { syncId, workerId: WORKER });
  assert.equal(last.attemptCount, 13);
  assert.equal(last.retryCount, 5);
  await sql`update public.catalogue_syncs set lease_expires_at = now() - interval '1 second' where id = ${syncId}::uuid`;
  assert.equal(
    await claimCatalogueSync(sql, { syncId, workerId: NEXT_WORKER }),
    null,
  );
  await pause(last);
  await recover(1, true);
  const resumed = await claimCatalogueSync(sql, {
    syncId,
    workerId: NEXT_WORKER,
  });
  assert.equal(resumed.attemptCount, 14);
  assert.equal(resumed.retryCount, 1);
  await sql`update public.catalogue_syncs set lease_expires_at = now() - interval '1 second' where id = ${syncId}::uuid`;
  await sql`select private.recover_stale_catalogue_syncs()`;
  const [recoverable] =
    await sql`select status from public.catalogue_syncs where id = ${syncId}::uuid`;
  assert.equal(recoverable.status, "queued");
});
