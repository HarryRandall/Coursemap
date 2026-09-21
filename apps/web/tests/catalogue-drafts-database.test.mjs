import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import {
  CatalogueDraftConflictError,
  createCatalogueDraft,
  discardCatalogueDraft,
  publishCatalogueDraft,
  restoreCatalogueVersion,
  saveCatalogueDraft,
  unpublishCatalogueRecord,
} from "../lib/catalogue/drafts.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../lib/catalogue-import/version-content.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const ADMIN_ID = "99000000-0000-4000-8000-000000000031";
const CODE = "TSTC9001";
const YEAR = 2026;
const SESSION_ID = "99000000-0000-4000-8000-000000000032";

let sql;
let recordId;

async function removeFixture() {
  await sql`delete from public.catalogue_listings where kind = 'course' and code = ${CODE}`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code = ${CODE}`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
  }
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
      'authenticated', 'authenticated', 'draft-admin@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    ) on conflict (id) do nothing
  `;
  await removeFixture();
  const [year] =
    await sql`select id from public.academic_years where year = ${YEAR}`;
  const [code] = await sql`
    insert into public.catalogue_codes (kind, code)
    values ('course', ${CODE}) returning id
  `;
  const [record] = await sql`
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    values (${code.id}, 'course', ${year.id}) returning id
  `;
  recordId = Number(record.id);
  await sql`
    insert into public.catalogue_listings (
      academic_year_id, kind, code, title, code_id, record_id, is_current,
      first_seen_at, last_seen_at
    ) values (
      ${year.id}, 'course', ${CODE}, 'Draft Systems', ${code.id}, ${record.id},
      true, now(), now()
    )
  `;
});

afterAll(async () => {
  if (!sql) return;
  await removeFixture();
  await sql`delete from auth.users where id = ${ADMIN_ID}`;
  await sql.end({ timeout: 5 });
});

test("mutable drafts autosave, audit, publish, discard and restore safely", async () => {
  const initial = await createCatalogueDraft({
    recordId,
    userId: ADMIN_ID,
    sql,
  });
  assert.equal(initial.revision, 0);
  assert.equal(initial.baseVersionId, null);
  assert.equal(initial.content.course.details.title, "Draft Systems");

  const edited = structuredClone(initial.content);
  edited.course.details.description = "A manually authored course.";
  const saved = await saveCatalogueDraft({
    recordId,
    expectedRevision: 0,
    content: edited,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(saved.draft.revision, 1);
  assert.deepEqual(saved.changedPaths, ["course.details.description"]);

  const [event] = await sql`
    select id, draft_revision, editing_session_id
    from public.catalogue_change_events
    where record_id = ${recordId} and event_kind = 'edit'
  `;
  assert.equal(Number(event.draft_revision), 1);
  assert.equal(event.editing_session_id, SESSION_ID);
  const changes = await sql`
    select field_path, old_value, new_value
    from public.catalogue_field_changes where event_id = ${event.id}
  `;
  assert.deepEqual(
    changes.map((row) => row.field_path),
    ["course.details.description"],
  );
  assert.equal(changes[0].old_value, null);
  assert.equal(changes[0].new_value, "A manually authored course.");

  const noOp = await saveCatalogueDraft({
    recordId,
    expectedRevision: 1,
    content: edited,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(noOp.unchanged, true);
  assert.equal(noOp.draft.revision, 1);
  const [eventCount] = await sql`
    select count(*)::integer as count from public.catalogue_change_events
    where record_id = ${recordId} and event_kind = 'edit'
  `;
  assert.equal(eventCount.count, 1);

  const stale = structuredClone(edited);
  stale.course.details.title = "Stale overwrite";
  await assert.rejects(
    saveCatalogueDraft({
      recordId,
      expectedRevision: 0,
      content: stale,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    }),
    CatalogueDraftConflictError,
  );
  const [storedDraft] = await sql`
    select content, revision from public.catalogue_drafts where record_id = ${recordId}
  `;
  assert.equal(Number(storedDraft.revision), 1);
  assert.equal(
    storedDraft.content.course.details.description,
    "A manually authored course.",
  );
  assert.equal(storedDraft.content.course.details.title, "Draft Systems");

  const provenance = await sql`
    select field_path, origin from public.catalogue_draft_provenance
    where record_id = ${recordId}
  `;
  assert.deepEqual(Array.from(provenance), [
    { field_path: "course.details.description", origin: "manual" },
  ]);

  const firstPublish = await publishCatalogueDraft({
    recordId,
    expectedRevision: 1,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const [published] = await sql`
    select published_version_id from public.catalogue_records where id = ${recordId}
  `;
  assert.equal(Number(published.published_version_id), firstPublish.versionId);
  assert.equal(
    (
      await sql`select count(*)::integer as count from public.catalogue_drafts where record_id = ${recordId}`
    )[0].count,
    0,
  );
  const publishedContent = await readVersionContent(
    sql,
    firstPublish.versionId,
  );
  assert.equal(
    publishedContent.course.details.description,
    "A manually authored course.",
  );

  const fromPublished = await createCatalogueDraft({
    recordId,
    userId: ADMIN_ID,
    sql,
  });
  assert.equal(fromPublished.baseVersionId, firstPublish.versionId);
  assert.equal(
    fromPublished.contentHash,
    contentHashForCatalogueContent(publishedContent),
  );
  const temporaryEdit = structuredClone(fromPublished.content);
  temporaryEdit.course.details.title = "Temporary title";
  await saveCatalogueDraft({
    recordId,
    expectedRevision: 0,
    content: temporaryEdit,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const reverted = await saveCatalogueDraft({
    recordId,
    expectedRevision: 1,
    content: fromPublished.content,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(reverted.draft.contentHash, fromPublished.contentHash);
  await assert.rejects(
    publishCatalogueDraft({
      recordId,
      expectedRevision: 2,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    }),
    (error) => error.code === "UNCHANGED_DRAFT",
  );
  const revertedDiscard = await discardCatalogueDraft({
    recordId,
    expectedRevision: 2,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(revertedDiscard.meaningful, false);

  const nextDraft = await createCatalogueDraft({
    recordId,
    userId: ADMIN_ID,
    sql,
  });
  const secondEdit = structuredClone(nextDraft.content);
  secondEdit.course.details.title = "Draft Systems Advanced";
  await saveCatalogueDraft({
    recordId,
    expectedRevision: 0,
    content: secondEdit,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const secondDraftProvenance = await sql`
    select field_path, origin, source_version_id
    from public.catalogue_draft_provenance
    where record_id = ${recordId}
    order by field_path
  `;
  assert.deepEqual(Array.from(secondDraftProvenance), [
    {
      field_path: "course.details.description",
      origin: "manual",
      source_version_id: String(firstPublish.versionId),
    },
    {
      field_path: "course.details.title",
      origin: "manual",
      source_version_id: null,
    },
  ]);
  await assert.rejects(
    publishCatalogueDraft({
      recordId,
      expectedRevision: 0,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    }),
    CatalogueDraftConflictError,
  );
  assert.equal(
    Number(
      (
        await sql`select published_version_id from public.catalogue_records where id = ${recordId}`
      )[0].published_version_id,
    ),
    firstPublish.versionId,
  );
  assert.equal(
    Number(
      (
        await sql`select revision from public.catalogue_drafts where record_id = ${recordId}`
      )[0].revision,
    ),
    1,
  );

  const secondPublish = await publishCatalogueDraft({
    recordId,
    expectedRevision: 1,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const publications = await sql`
    select version_id, unpublished_at from public.catalogue_publications
    where record_id = ${recordId} order by published_at
  `;
  assert.equal(publications.length, 2);
  assert.ok(publications[0].unpublished_at);
  assert.equal(publications[1].unpublished_at, null);

  await unpublishCatalogueRecord({
    recordId,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(
    (
      await sql`select published_version_id from public.catalogue_records where id = ${recordId}`
    )[0].published_version_id,
    null,
  );
  assert.equal(
    (
      await sql`select count(*)::integer as count from public.catalogue_versions where record_id = ${recordId}`
    )[0].count,
    2,
  );

  const blank = await createCatalogueDraft({
    recordId,
    userId: ADMIN_ID,
    sql,
  });
  const discardContent = structuredClone(blank.content);
  discardContent.course.details.description = "Work worth restoring.";
  const discardSave = await saveCatalogueDraft({
    recordId,
    expectedRevision: 0,
    content: discardContent,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const discarded = await discardCatalogueDraft({
    recordId,
    expectedRevision: discardSave.draft.revision,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(discarded.meaningful, true);
  assert.ok(discarded.checkpointVersionId);
  const checkpointContent = await readVersionContent(
    sql,
    discarded.checkpointVersionId,
  );
  assert.equal(
    checkpointContent.course.details.description,
    "Work worth restoring.",
  );

  const restored = await restoreCatalogueVersion({
    recordId,
    versionId: discarded.checkpointVersionId,
    expectedRevision: null,
    replaceExistingDraft: false,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(restored.revision, 0);
  assert.equal(
    restored.content.course.details.description,
    "Work worth restoring.",
  );
  const restoredProvenance = await sql`
    select field_path, origin, source_version_id
    from public.catalogue_draft_provenance where record_id = ${recordId}
  `;
  assert.deepEqual(Array.from(restoredProvenance), [
    {
      field_path: "course.details.description",
      origin: "manual",
      source_version_id: String(discarded.checkpointVersionId),
    },
  ]);

  await assert.rejects(
    restoreCatalogueVersion({
      recordId,
      versionId: firstPublish.versionId,
      expectedRevision: 0,
      replaceExistingDraft: false,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    }),
    (error) => error.code === "CONFIRM_REPLACE",
  );
  await assert.rejects(
    restoreCatalogueVersion({
      recordId,
      versionId: firstPublish.versionId,
      expectedRevision: 99,
      replaceExistingDraft: true,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    }),
    CatalogueDraftConflictError,
  );

  const noOpDiscard = await discardCatalogueDraft({
    recordId,
    expectedRevision: 0,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  assert.equal(noOpDiscard.meaningful, false);
  assert.equal(noOpDiscard.checkpointVersionId, null);
  assert.ok(secondPublish.versionId > firstPublish.versionId);
});
