import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";

import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { buildRetentionPlan } from "../scripts/catalogue/lib/retention-policy.mjs";
import {
  deleteRetentionBatchInTransaction,
  readRetentionSnapshot,
  removeRetentionObjectsInTransaction,
} from "../scripts/catalogue/lib/retention-store.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const OLD = "2026-01-01T00:00:00.000Z";
const CUTOFF = "2026-07-01T00:00:00.000Z";
const HASH = "a".repeat(64);
let sql;

beforeAll(async () => {
  sql = await createLocalDatabaseClient({
    env: {
      COURSEMAP_DATABASE_URL:
        process.env.COURSEMAP_RETENTION_TEST_DATABASE_URL ??
        localTestEnvironment().COURSEMAP_DATABASE_URL,
    },
  });
});
afterAll(async () => {
  if (sql) await sql.end();
});

// Rollback preserves append-only fixtures without disabling any trigger,
// including migration 043 when it is present in the coordinator's stack.
async function rollbackFixture(work) {
  const rollback = new Error("Roll back the retention fixture.");
  try {
    await sql.begin(async (tx) => {
      await work(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function syncFixture(
  tx,
  {
    status = "failed",
    decision = "keep_local",
    superseded = true,
    completed = OLD,
  } = {},
) {
  const [year] =
    await tx`select id from public.academic_years where year = 2026`;
  const [model] =
    await tx`select id from public.import_models where enabled order by id limit 1`;
  const [available] = await tx`select 'RETN' || number::text as code
    from generate_series(9000, 9999) number
    where not exists (select 1 from public.catalogue_codes where code = 'RETN' || number::text)
    order by number limit 1`;
  const [code] =
    await tx`insert into public.catalogue_codes (kind, code) values ('course', ${available.code}) returning id, code`;
  const [record] =
    await tx`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${code.id}, 'course', ${year.id}) returning id`;
  const [sync] =
    await tx`insert into public.catalogue_syncs (record_id, trigger, status, requested_model, parser_version, prompt_version, schema_version, completed_at)
    values (${record.id}, 'manual', ${status}, ${model.id}, 'retention-test', 'retention-test', 'retention-test', ${completed}) returning id`;
  const [change] =
    await tx`insert into public.catalogue_sync_changes (sync_id, record_id, field_path, review_unit_kind, classification, local_value_hash, decision, resolved_at, superseded_at, created_at, position)
    values (${sync.id}::uuid, ${record.id}, 'title', 'scalar', 'source_change', ${HASH}, ${decision}, ${decision ? OLD : null}, ${superseded ? OLD : null}, ${OLD}, 0) returning id::text`;
  const [stage] =
    await tx`insert into public.catalogue_sync_stages (sync_id, stage_name, attempt_number, status, started_at, completed_at)
    values (${sync.id}::uuid, 'source_fetch', 1, 'failed', ${OLD}, ${OLD}) returning id`;
  const path = `2026/${sync.id}/source_fetch/raw_html-${HASH}.html`;
  const [artifact] =
    await tx`insert into public.catalogue_sync_artifacts (sync_id, stage_id, kind, attempt_number, media_type, content_sha256, byte_size, storage_bucket, storage_path, created_at)
    values (${sync.id}::uuid, ${stage.id}::uuid, 'raw_html', 1, 'text/html', ${HASH}, 100, 'course-import-artifacts', ${path}, ${OLD}) returning id`;
  const [object] =
    await tx`insert into storage.objects (bucket_id, name, metadata, created_at, updated_at)
    values ('course-import-artifacts', ${path}, '{"size":100}'::jsonb, ${OLD}, ${OLD}) returning id`;
  return {
    yearId: year.id,
    modelId: model.id,
    code: code.code,
    recordId: record.id,
    syncId: sync.id,
    changeId: change.id,
    stageId: stage.id,
    artifactId: artifact.id,
    objectId: object.id,
    path,
  };
}

async function addVersion(tx, fixture) {
  const [source] =
    await tx`insert into public.catalogue_sources (name, kind, base_url) values ('Retention fixture', 'retention-test', ${`https://retention.example.test/${randomUUID()}`}) returning id`;
  const [document] =
    await tx`insert into public.catalogue_source_documents (source_id, record_id, academic_year_id, kind, external_key, canonical_url, content_sha256, fetched_at, storage_bucket, storage_path)
    values (${source.id}, ${fixture.recordId}, ${fixture.yearId}, 'course', ${fixture.code}, ${`https://programsandcourses.anu.edu.au/2026/course/${fixture.code}`}, ${HASH}, ${OLD}, 'course-import-artifacts', ${fixture.path}) returning id`;
  const [version] =
    await tx`insert into public.catalogue_versions (record_id, kind, academic_year_id, origin, content_hash, sync_id, source_document_id)
    values (${fixture.recordId}, 'course', ${fixture.yearId}, 'source', ${HASH}, ${fixture.syncId}::uuid, ${document.id}) returning id`;
  await tx`insert into public.catalogue_version_provenance (version_id, academic_year_id, field_path, method, source_document_id)
    values (${version.id}, ${fixture.yearId}, 'title', 'deterministic', ${document.id})`;
  await tx`insert into public.course_version_details (version_id, title, level, subject_code, units) values (${version.id}, 'Retained version', 1, 'TEST', 6)`;
  await tx`update public.catalogue_versions set sealed_at = now() where id = ${version.id}`;
  await tx`update public.catalogue_syncs set source_version_id = ${version.id}, source_document_id = ${document.id} where id = ${fixture.syncId}::uuid`;
  const [actor] =
    await tx`insert into auth.users (id) values (${randomUUID()}::uuid) returning id`;
  await tx`insert into public.catalogue_publications (record_id, version_id, published_by, published_at, unpublished_at, unpublished_by)
    values (${fixture.recordId}, ${version.id}, ${actor.id}::uuid, ${OLD}, ${OLD}, ${actor.id}::uuid)`;
  return version.id;
}

async function addRun(tx, fixture, state) {
  const [actor] =
    await tx`insert into auth.users (id) values (${randomUUID()}::uuid) returning id`;
  const [run] =
    await tx`insert into public.catalogue_course_runs (academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million, state)
    values (2026, ${actor.id}::uuid, ${fixture.modelId}, 1, 1, 0, 0, ${state}) returning id`;
  await tx`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${run.id}::uuid, ${fixture.recordId}, ${fixture.syncId}::uuid)`;
}

test("removes only approved old rows while publication, audit, reuse and live work survive", async () => {
  await rollbackFixture(async (tx) => {
    const disposable = await syncFixture(tx);
    const current = await syncFixture(tx, { superseded: false });
    const undecided = await syncFixture(tx, { decision: null });
    const live = await syncFixture(tx, { status: "paused", completed: null });
    const activeRun = await syncFixture(tx);
    await addRun(tx, activeRun, "active");
    const pausedRun = await syncFixture(tx);
    await addRun(tx, pausedRun, "paused");
    const recent = await syncFixture(tx, { completed: "2026-09-01T00:00:00Z" });
    const published = await syncFixture(tx);
    const versionId = await addVersion(tx, published);
    const audit = await syncFixture(tx);
    const [event] =
      await tx`insert into public.catalogue_change_events (record_id, event_kind, origin, sync_change_id)
      values (${audit.recordId}, 'source_kept', 'source', ${audit.changeId}) returning id`;
    await tx`insert into public.catalogue_field_changes (event_id, position, field_path, old_value, new_value) values (${event.id}, 0, 'title', '"old"'::jsonb, '"new"'::jsonb)`;
    const reusable = await syncFixture(tx);
    await tx`insert into public.catalogue_extractions (sync_id, extraction_number, requested_model, fingerprint, prompt_version, schema_version, request_artifact_id, response_artifact_id, validation_status, completed_at)
      values (${reusable.syncId}::uuid, 1, ${reusable.modelId}, ${HASH}, 'test', 'test', ${reusable.artifactId}::uuid, ${reusable.artifactId}::uuid, 'valid', ${OLD})`;
    const plan = buildRetentionPlan(await readRetentionSnapshot(tx), {
      cutoff: CUTOFF,
      target: "rollback-only-local-test",
    });
    expect(
      plan.candidates.changes.some((row) => row.id === disposable.changeId),
    ).toBe(true);
    let prematureStorageCalls = 0;
    const prematureStorage = {
      storage: {
        from: () => ({
          remove: async () => {
            prematureStorageCalls++;
            return { error: null };
          },
        }),
      },
    };
    await expect(
      removeRetentionObjectsInTransaction(
        tx,
        plan,
        plan.candidates.objects.filter((row) => row.id === disposable.objectId),
        prematureStorage,
      ),
    ).rejects.toThrow("still references");
    expect(prematureStorageCalls).toBe(0);
    for (const fixture of [
      current,
      undecided,
      live,
      activeRun,
      pausedRun,
      recent,
      audit,
    ]) {
      expect(
        plan.candidates.changes.some((row) => row.id === fixture.changeId),
      ).toBe(false);
    }
    for (const fixture of [
      current,
      undecided,
      live,
      activeRun,
      pausedRun,
      recent,
      published,
      audit,
      reusable,
    ]) {
      expect(
        plan.candidates.artifacts.some((row) => row.id === fixture.artifactId),
      ).toBe(false);
      expect(
        plan.candidates.stages.some((row) => row.id === fixture.stageId),
      ).toBe(false);
      expect(
        plan.candidates.objects.some((row) => row.id === fixture.objectId),
      ).toBe(false);
    }
    for (const [category, id] of [
      ["changes", disposable.changeId],
      ["artifacts", disposable.artifactId],
      ["stages", disposable.stageId],
    ]) {
      const rows = plan.candidates[category].filter((row) => row.id === id);
      expect(
        await deleteRetentionBatchInTransaction(tx, plan, category, rows),
      ).toBe(1);
    }
    expect(
      await tx`select id from public.catalogue_sync_changes where id = ${disposable.changeId}`,
    ).toHaveLength(0);
    expect(
      await tx`select id from public.catalogue_sync_artifacts where id = ${disposable.artifactId}::uuid`,
    ).toHaveLength(0);
    expect(
      await tx`select id from public.catalogue_sync_stages where id = ${disposable.stageId}::uuid`,
    ).toHaveLength(0);
    expect(
      await tx`select id from public.catalogue_versions where id = ${versionId}`,
    ).toHaveLength(1);
    expect(
      await tx`select version_id from public.course_version_details where version_id = ${versionId}`,
    ).toHaveLength(1);
    expect(
      await tx`select id from public.catalogue_version_provenance where version_id = ${versionId}`,
    ).toHaveLength(1);
    expect(
      await tx`select id from public.catalogue_publications where version_id = ${versionId}`,
    ).toHaveLength(1);
    const [survivingEvent] =
      await tx`select sync_change_id::text from public.catalogue_change_events where id = ${event.id}`;
    expect(survivingEvent.sync_change_id).toBe(audit.changeId);
    expect(
      await tx`select event_id from public.catalogue_field_changes where event_id = ${event.id}`,
    ).toHaveLength(1);
    // Payload removal is deliberately a separate API phase. The DB phase must
    // leave the object intact and eligible as an orphan for an approved retry.
    expect(
      await tx`select id from storage.objects where id = ${disposable.objectId}::uuid`,
    ).toHaveLength(1);
    const retry = buildRetentionPlan(await readRetentionSnapshot(tx), plan);
    expect(
      retry.candidates.objects.find((row) => row.id === disposable.objectId)
        ?.category,
    ).toBe("orphan_objects");
    const objects = retry.candidates.objects.filter(
      (row) => row.id === disposable.objectId,
    );
    const storage = {
      storage: {
        from: (bucket) => ({
          remove: async (paths) => {
            expect(bucket).toBe("course-import-artifacts");
            // Simulate only the Storage API boundary; no network or payload calls.
            await tx`delete from storage.objects where bucket_id = ${bucket} and name = any(${tx.array(paths)}::text[])`;
            return { error: null };
          },
        }),
      },
    };
    expect(
      await removeRetentionObjectsInTransaction(tx, retry, objects, storage),
    ).toBe(1);
    expect(
      await tx`select id from storage.objects where id = ${disposable.objectId}::uuid`,
    ).toHaveLength(0);
  });
});

test("a newly added audit reference blocks an approved batch before any deletion", async () => {
  await rollbackFixture(async (tx) => {
    const fixture = await syncFixture(tx);
    const plan = buildRetentionPlan(await readRetentionSnapshot(tx), {
      cutoff: CUTOFF,
      target: "rollback-only-local-test",
    });
    const rows = plan.candidates.changes.filter(
      (row) => row.id === fixture.changeId,
    );
    await tx`insert into public.catalogue_change_events (record_id, event_kind, origin, sync_change_id) values (${fixture.recordId}, 'source_kept', 'source', ${fixture.changeId})`;
    await expect(
      deleteRetentionBatchInTransaction(tx, plan, "changes", rows),
    ).rejects.toThrow("became protected");
    expect(
      await tx`select id from public.catalogue_sync_changes where id = ${fixture.changeId}`,
    ).toHaveLength(1);
  });
});

test("a newly registered artefact prevents the stage cascade from removing it", async () => {
  await rollbackFixture(async (tx) => {
    const fixture = await syncFixture(tx);
    const plan = buildRetentionPlan(await readRetentionSnapshot(tx), {
      cutoff: CUTOFF,
      target: "rollback-only-local-test",
    });
    const stages = plan.candidates.stages.filter(
      (row) => row.id === fixture.stageId,
    );
    expect(stages).toHaveLength(1);
    const [artifact] =
      await tx`insert into public.catalogue_sync_artifacts (sync_id, stage_id, kind, attempt_number, media_type, content_sha256, byte_size, storage_bucket, storage_path)
      values (${fixture.syncId}::uuid, ${fixture.stageId}::uuid, 'model_input', 1, 'application/json', ${HASH}, 100, 'course-import-artifacts', ${`${fixture.path}.new`}) returning id`;
    await expect(
      deleteRetentionBatchInTransaction(tx, plan, "stages", stages),
    ).rejects.toThrow("became protected");
    expect(
      await tx`select id from public.catalogue_sync_artifacts where id = ${artifact.id}::uuid`,
    ).toHaveLength(1);
    expect(
      await tx`select id from public.catalogue_sync_stages where id = ${fixture.stageId}::uuid`,
    ).toHaveLength(1);
  });
});
