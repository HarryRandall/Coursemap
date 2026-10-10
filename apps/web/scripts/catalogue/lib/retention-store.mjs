import { createClient } from "@supabase/supabase-js";

import { assertVerifiedImportDatabaseClient } from "./local-database.mjs";
import { buildRetentionPlan, RETENTION_BUCKET } from "./retention-policy.mjs";

/** Call inside a transaction so all eligibility checks see one catalogue state. */
export async function readRetentionSnapshot(sql, scope) {
  const ids = scope?.rows.map((row) => row.id) ?? [];
  const paths = scope?.rows.map((row) => row.name).filter(Boolean) ?? [];
  const category = scope?.category;
  const syncs =
    await sql`select id::text, status, completed_at, updated_at, lock_version,
    source_version_id::text, source_document_id::text from public.catalogue_syncs`;
  const changes =
    await sql`select id::text, sync_id::text, decision, superseded_at,
    resolved_at, created_at, pg_column_size(changes) as row_bytes,
    md5(changes::text) as fingerprint from public.catalogue_sync_changes changes
    where ${!scope} or (${category === "changes"} and id = any(${sql.array(category === "changes" ? ids : [])}::bigint[]))`;
  const artifacts = await sql`select id::text, sync_id::text, stage_id::text,
    storage_bucket, storage_path, created_at, pg_column_size(artifacts) as row_bytes,
    md5(artifacts::text) as fingerprint from public.catalogue_sync_artifacts artifacts
    where ${!scope}
      or (${category === "artifacts"} and id = any(${sql.array(category === "artifacts" ? ids : [])}::uuid[]))
      or (${category === "stages"} and stage_id = any(${sql.array(category === "stages" ? ids : [])}::uuid[]))
      or (${category === "objects"} and storage_bucket = ${RETENTION_BUCKET} and storage_path = any(${sql.array(paths)}::text[]))`;
  const stageIds =
    category === "stages" ? ids : artifacts.map((row) => row.stage_id);
  const stages = await sql`select id::text, sync_id::text, status, completed_at,
    pg_column_size(stages) as row_bytes, md5(stages::text) as fingerprint
    from public.catalogue_sync_stages stages
    where ${!scope} or id = any(${sql.array(stageIds)}::uuid[])`;
  const stageStates = scope
    ? await sql`select distinct sync_id::text, status, completed_at from public.catalogue_sync_stages`
    : stages;
  const objects = await sql`select id::text, name, created_at, updated_at,
    pg_column_size(objects) as row_bytes,
    case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint::text else '0' end as payload_bytes,
    md5(objects::text) as fingerprint from storage.objects objects where bucket_id = ${RETENTION_BUCKET}
      and (${!scope} or (${category === "objects"} and id = any(${sql.array(category === "objects" ? ids : [])}::uuid[])))`;
  const events =
    await sql`select distinct sync_change_id::text from public.catalogue_change_events where sync_change_id is not null`;
  const reviewSyncs =
    await sql`select distinct changes.sync_id::text from public.catalogue_sync_changes changes
    where changes.superseded_at is null or changes.decision is null
      or exists (select 1 from public.catalogue_change_events events where events.sync_change_id = changes.id)`;
  const versions =
    await sql`select id::text, sync_id::text, source_document_id::text from public.catalogue_versions`;
  const provenance =
    await sql`select distinct source_document_id::text from public.catalogue_version_provenance where source_document_id is not null`;
  const documents =
    await sql`select id::text, storage_bucket, storage_path from public.catalogue_source_documents`;
  const pages =
    await sql`select id::text, storage_bucket, storage_path from public.catalogue_source_pages`;
  const extractions =
    await sql`select id::text, request_artifact_id::text, response_artifact_id::text, validated_artifact_id::text from public.catalogue_extractions`;
  const runs =
    await sql`select id::text, state from public.catalogue_course_runs`;
  const runItems =
    await sql`select run_id::text, sync_id::text from public.catalogue_course_run_items`;
  const retained = scope
    ? []
    : await sql`
    select 'catalogue_versions_and_children' as category, count(*)::int as count from public.catalogue_versions
    union all select 'catalogue_version_provenance', count(*)::int from public.catalogue_version_provenance
    union all select 'catalogue_drafts', count(*)::int from public.catalogue_drafts
    union all select 'catalogue_draft_provenance', count(*)::int from public.catalogue_draft_provenance
    union all select 'catalogue_extractions', count(*)::int from public.catalogue_extractions
    union all select 'catalogue_publications', count(*)::int from public.catalogue_publications
    union all select 'catalogue_change_events', count(*)::int from public.catalogue_change_events
    union all select 'catalogue_field_changes', count(*)::int from public.catalogue_field_changes
    union all select 'catalogue_source_documents', count(*)::int from public.catalogue_source_documents
    union all select 'catalogue_source_pages', count(*)::int from public.catalogue_source_pages`;
  // Normalise timestamps once so plain fixture snapshots and live rows hash alike.
  return JSON.parse(
    JSON.stringify({
      syncs,
      changes,
      stages,
      stageStates,
      artifacts,
      objects,
      events,
      reviewSyncs,
      versions,
      provenance,
      documents,
      pages,
      extractions,
      runs,
      runItems,
      retained,
    }),
  );
}

export async function readRetentionPlan(sql, options) {
  assertVerifiedImportDatabaseClient(sql);
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '15s'`;
    return buildRetentionPlan(await readRetentionSnapshot(tx), options);
  });
}

async function lockRetentionReferences(tx) {
  await tx`set local lock_timeout = '2s'`;
  await tx`set local statement_timeout = '5s'`;
  await tx`set local transaction_timeout = '15s'`;
  await tx`set local idle_in_transaction_session_timeout = '15s'`;
  // Block registration, review, publication and run changes until the batch has
  // been checked and removed. Storage's own table must stay writable by its API.
  await tx`lock table public.catalogue_syncs, public.catalogue_sync_changes,
    public.catalogue_sync_stages, public.catalogue_sync_artifacts,
    public.catalogue_extractions, public.catalogue_change_events,
    public.catalogue_versions, public.catalogue_version_provenance,
    public.catalogue_source_documents, public.catalogue_source_pages,
    public.catalogue_course_runs, public.catalogue_course_run_items
    in share row exclusive mode`;
}

function comparable(row) {
  // Row-first cleanup turns an approved linked object into an orphan.
  const { category, ...identity } = row;
  void category;
  return JSON.stringify(identity);
}
function assertBatchStillEligible(current, category, rows) {
  const eligible = new Map(
    current.candidates[category].map((row) => [row.id, comparable(row)]),
  );
  if (rows.some((row) => eligible.get(row.id) !== comparable(row))) {
    throw new Error(
      "A retention batch changed or became protected. Review a fresh dry run.",
    );
  }
}

export async function deleteRetentionBatch(sql, plan, category, rows) {
  assertVerifiedImportDatabaseClient(sql);
  if (
    !rows.length ||
    rows.length > 50 ||
    !["changes", "artifacts", "stages"].includes(category)
  )
    throw new Error("The retention row batch is invalid.");
  return sql.begin((tx) =>
    deleteRetentionBatchInTransaction(tx, plan, category, rows),
  );
}

/** Shared with rollback-only database fixtures; operational callers use the verified client wrapper. */
export async function deleteRetentionBatchInTransaction(
  tx,
  plan,
  category,
  rows,
) {
  await lockRetentionReferences(tx);
  const current = buildRetentionPlan(
    await readRetentionSnapshot(tx, { category, rows }),
    plan,
  );
  assertBatchStillEligible(current, category, rows);
  const ids = rows.map((row) => row.id);
  let deleted;
  if (category === "changes") {
    deleted = await tx`delete from public.catalogue_sync_changes changes
      where id = any(${tx.array(ids)}::bigint[])
        and not exists (select 1 from public.catalogue_change_events events where events.sync_change_id = changes.id)
      returning id`;
  } else if (category === "artifacts") {
    deleted =
      await tx`delete from public.catalogue_sync_artifacts where id = any(${tx.array(ids)}::uuid[]) returning id`;
  } else if (category === "stages") {
    deleted = await tx`delete from public.catalogue_sync_stages stages
      where id = any(${tx.array(ids)}::uuid[])
        and not exists (select 1 from public.catalogue_sync_artifacts artifacts where artifacts.stage_id = stages.id)
      returning id`;
  } else throw new Error("The retention row category is invalid.");
  if (deleted.length !== rows.length)
    throw new Error("The retention row batch was not completely removed.");
  return deleted.length;
}

export function createRetentionStorageClient(target, env = process.env) {
  if (!target.storageUrl || !env.SUPABASE_SECRET_KEY?.trim())
    throw new Error(
      "Storage retention requires NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SECRET_KEY.",
    );
  return createClient(target.storageUrl, env.SUPABASE_SECRET_KEY.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(8000) }),
    },
  });
}

/** Delete payloads only after every public DB locator has gone. A failed API
 * call leaves old orphan objects which a fresh approved plan can retry.
 */
export async function removeRetentionObjects(sql, plan, rows, storageClient) {
  assertVerifiedImportDatabaseClient(sql);
  if (!rows.length || rows.length > 20)
    throw new Error("The retention Storage batch is invalid.");
  return sql.begin((tx) =>
    removeRetentionObjectsInTransaction(tx, plan, rows, storageClient),
  );
}

/** Injectable Storage boundary for rollback-only database fixtures. */
export async function removeRetentionObjectsInTransaction(
  tx,
  plan,
  rows,
  storageClient,
) {
  await lockRetentionReferences(tx);
  const snapshot = await readRetentionSnapshot(tx, {
    category: "objects",
    rows,
  });
  const current = buildRetentionPlan(snapshot, plan);
  assertBatchStillEligible(current, "objects", rows);
  const paths = new Set(rows.map((row) => row.name));
  if (
    [...snapshot.artifacts, ...snapshot.documents, ...snapshot.pages].some(
      (row) =>
        row.storage_bucket === RETENTION_BUCKET && paths.has(row.storage_path),
    )
  ) {
    throw new Error(
      "A retained database row still references a Storage object.",
    );
  }
  const { error } = await storageClient.storage
    .from(RETENTION_BUCKET)
    .remove(rows.map((row) => row.name));
  if (error)
    throw new Error(
      "The retention Storage batch failed. Review a fresh dry run before retrying.",
    );
  const [remaining] =
    await tx`select count(*)::int as count from storage.objects
    where bucket_id = ${RETENTION_BUCKET} and name = any(${tx.array([...paths])}::text[])`;
  if (remaining.count !== 0)
    throw new Error("The Storage API did not remove every approved object.");
  return rows.length;
}
