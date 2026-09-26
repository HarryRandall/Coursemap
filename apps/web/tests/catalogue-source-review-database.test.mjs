import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import {
  CATALOGUE_CONTENT_SCHEMA_VERSION,
  emptyCatalogueContent,
} from "../lib/catalogue/content.ts";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content.ts";
import { persistSourceVersion } from "../lib/catalogue-sync/persist-source-version.ts";
import { ensureAnuSourceId } from "../lib/catalogue-sync/sync-store.ts";
import { loadSourceReview } from "../lib/catalogue/source-review-store.ts";
import { resolveSourceChange } from "../lib/catalogue/source-review-decisions.ts";
import { publishCatalogueDraft } from "../lib/catalogue/drafts.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const YEAR = 2026;
const CONFLICT_CODE = "TSTC9201";
const CHANGE_CODE = "TSTC9202";
const FIRST_READ_CODE = "TSTC9203";
const ADMIN_ID = "99000000-0000-4000-8000-000000000041";

let sql;
let yearId;
let sourceId;
const records = new Map();
let documentCounter = 0;

function sourceContent(code, title, description) {
  const content = emptyCatalogueContent({
    kind: "course",
    code,
    academicYear: YEAR,
    title,
  });
  content.course.details.description = description;
  content.evidence = [
    {
      fieldPath: "description",
      method: "model",
      confidence: 0.9,
      sourceLocator: "#description",
      sourceExcerpt: description,
    },
  ];
  content.contentHash = contentHashForCatalogueContent(content);
  return content;
}

async function removeFixtures() {
  await sql`delete from public.catalogue_listings where code in (${CONFLICT_CODE}, ${CHANGE_CODE}, ${FIRST_READ_CODE})`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code in (${CONFLICT_CODE}, ${CHANGE_CODE}, ${FIRST_READ_CODE})`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
    await sql`alter table public.catalogue_source_documents enable trigger catalogue_source_documents_reject_mutation`;
  }
}

async function createRecord(code, title) {
  const [identity] = await sql`
    insert into public.catalogue_codes (kind, code)
    values ('course', ${code}) returning id
  `;
  const [record] = await sql`
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    values (${identity.id}, 'course', ${yearId}) returning id
  `;
  await sql`
    insert into public.catalogue_listings (
      academic_year_id, kind, code, title, code_id, record_id, is_current,
      first_seen_at, last_seen_at
    ) values (
      ${yearId}, 'course', ${code}, ${title}, ${identity.id}, ${record.id},
      true, now(), now()
    )
  `;
  records.set(code, Number(record.id));
  return Number(record.id);
}

async function writeDraft(recordId, content, revision = 1) {
  await sql`
    insert into public.catalogue_drafts (
      record_id, content, content_hash, content_schema_version, revision
    ) values (
      ${recordId}, ${sql.json(content)}, ${content.contentHash},
      ${CATALOGUE_CONTENT_SCHEMA_VERSION}, ${revision}
    )
    on conflict (record_id) do update set content = excluded.content,
      content_hash = excluded.content_hash, revision = excluded.revision,
      updated_at = now()
  `;
}

/** Runs one ANU observation against a record and returns the sync outcome. */
async function observeSource(code, content) {
  const recordId = records.get(code);
  const [record] = await sql`
    select latest_source_version_id from public.catalogue_records where id = ${recordId}
  `;
  const [sync] = await sql`
    insert into public.catalogue_syncs (
      record_id, trigger, status, requested_model, parser_version,
      prompt_version, schema_version, previous_source_version_id
    ) values (
      ${recordId}, 'manual', 'running',
      (select id from public.import_models where enabled order by id limit 1),
      'test-parser', 'test-prompt', 'test-schema', ${record.latest_source_version_id}
    ) returning id
  `;
  documentCounter += 1;
  const digest = documentCounter.toString(16).padStart(64, "0");
  const [document] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key,
      canonical_url, content_sha256, http_status, fetched_at
    ) values (
      ${sourceId}, ${recordId}, ${yearId}, 'course', ${code},
      ${`https://programsandcourses.anu.edu.au/course/${code}`},
      ${digest}, 200, now()
    ) returning id
  `;
  const outcome = await persistSourceVersion(sql, {
    claim: {
      syncId: sync.id,
      kind: "course",
      code,
      academicYear: YEAR,
      academicYearId: Number(yearId),
      recordId,
      previousSourceVersionId:
        record.latest_source_version_id === null
          ? null
          : Number(record.latest_source_version_id),
      requestedModel: "test",
      parserVersion: "test-parser",
      promptVersion: "test-prompt",
      schemaVersion: "test-schema",
      sourceId: Number(sourceId),
      attemptCount: 1,
      lockVersion: 1,
    },
    sourceDocumentId: Number(document.id),
    write: content,
  });
  await sql`update public.catalogue_syncs set status = ${outcome.status}, completed_at = now()
    where id = ${sync.id}`;
  return { ...outcome, syncId: sync.id };
}

async function currentReview(code) {
  const recordId = records.get(code);
  const [draft] = await sql`
    select content from public.catalogue_drafts where record_id = ${recordId}
  `;
  return loadSourceReview(recordId, draft ? draft.content : null);
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
  });
  sql = await createLocalDatabaseClient();
  await sql`
    insert into auth.users (
      instance_id, id, aud, role, email, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', ${ADMIN_ID},
      'authenticated', 'authenticated', 'source-review@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    ) on conflict (id) do nothing
  `;
  await removeFixtures();
  [{ id: yearId }] = await sql`
    select id from public.academic_years where year = ${YEAR}
  `;
  sourceId = await ensureAnuSourceId(sql);
  await createRecord(CONFLICT_CODE, "Conflict Record");
  await createRecord(CHANGE_CODE, "Change Record");
  await createRecord(FIRST_READ_CODE, "First Read Record");
});

afterAll(async () => {
  if (!sql) return;
  await removeFixtures();
  await sql`delete from auth.users where id = ${ADMIN_ID}`;
  await sql.end({ timeout: 5 });
});

test("keeping a local value survives an unchanged source and reopens when ANU moves", async () => {
  const recordId = records.get(CONFLICT_CODE);
  await writeDraft(
    recordId,
    sourceContent(CONFLICT_CODE, "Conflict Record", "Locally authored."),
  );

  const first = await observeSource(
    CONFLICT_CODE,
    sourceContent(CONFLICT_CODE, "Conflict Record", "First ANU wording."),
  );
  assert.equal(first.status, "review_required");
  const opened = await currentReview(CONFLICT_CODE);
  assert.deepEqual(
    opened.conflicts.map((change) => change.fieldPath),
    ["course.details.description"],
  );
  assert.equal(opened.incoming.length, 0);

  const kept = await resolveSourceChange({
    recordId,
    changeId: opened.conflicts[0].id,
    decision: "keep_local",
    userId: ADMIN_ID,
    sql,
  });
  assert.equal(kept.decision, "keep_local");
  const [afterKeep] = await sql`
    select content, revision from public.catalogue_drafts where record_id = ${recordId}
  `;
  assert.equal(
    afterKeep.content.course.details.description,
    "Locally authored.",
  );
  assert.equal(Number(afterKeep.revision), 1);
  const [keptEvent] = await sql`
    select event_kind, origin, actor_id, sync_change_id
    from public.catalogue_change_events
    where record_id = ${recordId} and event_kind = 'source_kept'
  `;
  assert.equal(keptEvent.origin, "source");
  assert.equal(keptEvent.actor_id, ADMIN_ID);
  assert.equal(
    Number(keptEvent.sync_change_id),
    opened.conflicts[0].id,
    "the changelog can name the field that was kept",
  );

  // ANU repeats the same wording. The baseline advanced, so this is an
  // override rather than a question the administrator already answered.
  const repeated = await observeSource(
    CONFLICT_CODE,
    sourceContent(CONFLICT_CODE, "Conflict Record", "First ANU wording."),
  );
  assert.equal(repeated.status, "unchanged");
  const quiet = await currentReview(CONFLICT_CODE);
  assert.equal(quiet.conflicts.length, 0);
  assert.equal(quiet.incoming.length, 0);

  const moved = await observeSource(
    CONFLICT_CODE,
    sourceContent(CONFLICT_CODE, "Conflict Record", "Second ANU wording."),
  );
  assert.equal(moved.status, "review_required");
  const reopened = await currentReview(CONFLICT_CODE);
  assert.deepEqual(
    reopened.conflicts.map((change) => [
      change.fieldPath,
      change.baseSourceValue,
      change.localValue,
      change.incomingSourceValue,
    ]),
    [
      [
        "course.details.description",
        "First ANU wording.",
        "Locally authored.",
        "Second ANU wording.",
      ],
    ],
  );
  const [superseded] = await sql`
    select count(*)::integer as count from public.catalogue_sync_changes
    where record_id = ${recordId} and superseded_at is not null
  `;
  assert.equal(superseded.count, 1);
  const [stillUnpublished] = await sql`
    select published_version_id from public.catalogue_records where id = ${recordId}
  `;
  assert.equal(stillUnpublished.published_version_id, null);
});

test("using ANU writes one path, keeps unrelated edits and moves only its provenance", async () => {
  const recordId = records.get(CHANGE_CODE);
  await writeDraft(
    recordId,
    sourceContent(CHANGE_CODE, "Change Record", "Shared wording."),
  );
  await sql`
    insert into public.catalogue_draft_provenance (record_id, field_path, origin, changed_by)
    values (${recordId}, 'course.details.title', 'manual', ${ADMIN_ID})
  `;

  const agreed = await observeSource(
    CHANGE_CODE,
    sourceContent(CHANGE_CODE, "Change Record", "Shared wording."),
  );
  assert.equal(agreed.status, "review_required");
  const converged = await currentReview(CHANGE_CODE);
  assert.equal(converged, null);

  const changed = await observeSource(
    CHANGE_CODE,
    sourceContent(CHANGE_CODE, "Change Record", "Updated ANU wording."),
  );
  assert.equal(changed.status, "review_required");
  const review = await currentReview(CHANGE_CODE);
  assert.deepEqual(
    review.incoming.map((change) => change.fieldPath),
    ["course.details.description"],
  );

  // An edit to a different path must not block this decision.
  const [beforeEdit] = await sql`
    select content from public.catalogue_drafts where record_id = ${recordId}
  `;
  const edited = structuredClone(beforeEdit.content);
  edited.course.details.title = "Locally retitled";
  await writeDraft(
    recordId,
    { ...edited, contentHash: contentHashForCatalogueContent(edited) },
    2,
  );
  const unaffected = await currentReview(CHANGE_CODE);
  assert.equal(unaffected.incoming[0].isStale, false);
  assert.equal(unaffected.incoming[0].classification, "source_change");

  const applied = await resolveSourceChange({
    recordId,
    changeId: unaffected.incoming[0].id,
    decision: "use_source",
    userId: ADMIN_ID,
    sql,
  });
  assert.equal(applied.revision, 3);
  const [afterApply] = await sql`
    select content, revision from public.catalogue_drafts where record_id = ${recordId}
  `;
  assert.equal(
    afterApply.content.course.details.description,
    "Updated ANU wording.",
  );
  assert.equal(afterApply.content.course.details.title, "Locally retitled");

  const provenance = await sql`
    select field_path, origin, source_version_id
    from public.catalogue_draft_provenance where record_id = ${recordId}
    order by field_path
  `;
  assert.deepEqual(
    provenance.map((row) => [row.field_path, row.origin]),
    [
      ["course.details.title", "manual"],
      ["description", "model"],
    ],
  );
  assert.equal(
    Number(provenance[1].source_version_id),
    changed.sourceVersionId,
  );

  const [acceptedEvent] = await sql`
    select events.id, events.event_kind, events.draft_revision, events.sync_change_id
    from public.catalogue_change_events as events
    where events.record_id = ${recordId} and events.event_kind = 'source_accepted'
  `;
  assert.equal(Number(acceptedEvent.draft_revision), 3);
  assert.equal(Number(acceptedEvent.sync_change_id), unaffected.incoming[0].id);
  const fieldChanges = await sql`
    select field_path, new_value from public.catalogue_field_changes
    where event_id = ${acceptedEvent.id}
  `;
  assert.deepEqual(
    fieldChanges.map((row) => row.field_path),
    ["course.details.description"],
  );

  // A later edit to the same path is a genuine divergence, so the next
  // review row reclassifies rather than silently discarding the edit.
  const next = await observeSource(
    CHANGE_CODE,
    sourceContent(CHANGE_CODE, "Change Record", "Third ANU wording."),
  );
  assert.equal(next.status, "review_required");
  const pending = await currentReview(CHANGE_CODE);
  assert.equal(pending.incoming[0].classification, "source_change");
  const [current] = await sql`
    select content from public.catalogue_drafts where record_id = ${recordId}
  `;
  const rewritten = structuredClone(current.content);
  rewritten.course.details.description = "Rewritten locally.";
  await writeDraft(
    recordId,
    { ...rewritten, contentHash: contentHashForCatalogueContent(rewritten) },
    4,
  );
  const reclassified = await currentReview(CHANGE_CODE);
  assert.equal(reclassified.incoming.length, 0);
  assert.equal(reclassified.conflicts.length, 1);
  assert.equal(reclassified.conflicts[0].isStale, true);
  assert.equal(reclassified.conflicts[0].localValue, "Rewritten locally.");
});

test("a first reading is rated for review and holds publishing until approved", async () => {
  const recordId = records.get(FIRST_READ_CODE);
  const content = sourceContent(
    FIRST_READ_CODE,
    "First Read Record",
    "Read from a page that barely says it.",
  );
  content.evidence[0].confidence = 0.4;
  content.contentHash = contentHashForCatalogueContent(content);

  const first = await observeSource(FIRST_READ_CODE, content);
  assert.equal(first.populatedDraft, true);

  const review = await currentReview(FIRST_READ_CODE);
  const description = review.firstRead.find(
    (change) => change.fieldPath === "course.details.description",
  );
  assert.equal(description.band, "needs_review");
  assert.equal(description.confidence, 0.4);
  assert.equal(review.firstRead[0].id, description.id, "least certain first");
  assert.equal(
    review.firstRead.find(
      (change) => change.fieldPath === "course.details.title",
    ).band,
    "accepted",
    "a value with no confidence is taken as read",
  );

  const [draft] = await sql`
    select revision from public.catalogue_drafts where record_id = ${recordId}
  `;
  await assert.rejects(
    publishCatalogueDraft({
      recordId,
      expectedRevision: Number(draft.revision),
      userId: ADMIN_ID,
      editingSessionId: "11111111-1111-4111-8111-111111111111",
      sql,
    }),
    (error) => error.code === "FIRST_READ_REVIEW",
  );

  await resolveSourceChange({
    recordId,
    changeId: description.id,
    decision: "use_source",
    userId: ADMIN_ID,
    sql,
  });
  const [unchanged] = await sql`
    select revision from public.catalogue_drafts where record_id = ${recordId}
  `;
  assert.equal(
    Number(unchanged.revision),
    Number(draft.revision),
    "approving a first reading keeps the draft as it is",
  );
  const versionId = await publishCatalogueDraft({
    recordId,
    expectedRevision: Number(draft.revision),
    userId: ADMIN_ID,
    editingSessionId: "11111111-1111-4111-8111-111111111111",
    sql,
  });
  assert.ok(versionId);
});
