import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import {
  createCatalogueDraft,
  discardCatalogueDraft,
  publishCatalogueDraft,
  restoreCatalogueVersion,
  saveCatalogueDraft,
  unpublishCatalogueRecord,
} from "../lib/catalogue/drafts.ts";
import { readVersionContent } from "../lib/catalogue-import/version-content.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const ADMIN_ID = "99000000-0000-4000-8000-000000000051";
const CODE = "TSTC9301";
const YEAR = 2026;
const SESSION_ID = "99000000-0000-4000-8000-000000000052";
const SECOND_SESSION_ID = "99000000-0000-4000-8000-000000000053";

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

async function events() {
  return sql`
    select id, event_kind, origin, actor_id, editing_session_id, version_id,
      draft_revision
    from public.catalogue_change_events
    where record_id = ${recordId}
    order by id
  `;
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
      'authenticated', 'authenticated', 'changelog-admin@example.test',
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
      ${year.id}, 'course', ${CODE}, 'Changelog Systems', ${code.id},
      ${record.id}, true, now(), now()
    )
  `;
});

afterAll(async () => {
  if (!sql) return;
  await removeFixture();
  await sql`delete from auth.users where id = ${ADMIN_ID}`;
  await sql.end({ timeout: 5 });
});

test("every operation leaves one attributable audit event behind", async () => {
  const draft = await createCatalogueDraft({ recordId, userId: ADMIN_ID, sql });
  let revision = draft.revision;
  let content = draft.content;
  for (const description of ["First pass.", "Second pass.", "Third pass."]) {
    const next = structuredClone(content);
    next.course.details.description = description;
    const saved = await saveCatalogueDraft({
      recordId,
      expectedRevision: revision,
      content: next,
      userId: ADMIN_ID,
      editingSessionId: SESSION_ID,
      sql,
    });
    revision = saved.draft.revision;
    content = saved.draft.content;
  }

  const autosaves = (await events()).filter(
    (event) => event.event_kind === "edit",
  );
  assert.equal(autosaves.length, 3);
  assert.equal(
    new Set(autosaves.map((event) => event.editing_session_id)).size,
    1,
  );
  assert.deepEqual(
    autosaves.map((event) => Number(event.draft_revision)),
    [1, 2, 3],
  );
  assert.equal(autosaves[0].actor_id, ADMIN_ID);

  const published = await publishCatalogueDraft({
    recordId,
    expectedRevision: revision,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  await unpublishCatalogueRecord({
    recordId,
    userId: ADMIN_ID,
    editingSessionId: SESSION_ID,
    sql,
  });
  const lifecycle = (await events()).filter((event) =>
    ["publish", "unpublish"].includes(event.event_kind),
  );
  assert.deepEqual(
    lifecycle.map((event) => [event.event_kind, Number(event.version_id)]),
    [
      ["publish", published.versionId],
      ["unpublish", published.versionId],
    ],
  );
});

test("restoring a version keeps the draft it replaces", async () => {
  const draft = await createCatalogueDraft({ recordId, userId: ADMIN_ID, sql });
  const inProgress = structuredClone(draft.content);
  inProgress.course.details.description = "Work in progress worth keeping.";
  const saved = await saveCatalogueDraft({
    recordId,
    expectedRevision: draft.revision,
    content: inProgress,
    userId: ADMIN_ID,
    editingSessionId: SECOND_SESSION_ID,
    sql,
  });

  const [oldest] = await sql`
    select id from public.catalogue_versions where record_id = ${recordId}
    order by id limit 1
  `;
  const restored = await restoreCatalogueVersion({
    recordId,
    versionId: Number(oldest.id),
    expectedRevision: saved.draft.revision,
    replaceExistingDraft: true,
    userId: ADMIN_ID,
    editingSessionId: SECOND_SESSION_ID,
    sql,
  });
  assert.ok(restored.replacedVersionId);

  const replaced = await readVersionContent(sql, restored.replacedVersionId);
  assert.equal(
    replaced.course.details.description,
    "Work in progress worth keeping.",
  );
  const [checkpoint] = (await events()).filter(
    (event) =>
      event.event_kind === "discard" &&
      Number(event.version_id) === restored.replacedVersionId,
  );
  assert.ok(checkpoint, "the replaced draft is offered back in the changelog");

  const [restoreEvent] = (await events()).filter(
    (event) => event.event_kind === "restore",
  );
  assert.equal(Number(restoreEvent.version_id), Number(oldest.id));
  const [oldestAfter] = await sql`
    select content_hash, sealed_at from public.catalogue_versions where id = ${oldest.id}
  `;
  assert.ok(oldestAfter.sealed_at, "the restored version is untouched history");

  await discardCatalogueDraft({
    recordId,
    expectedRevision: restored.revision,
    userId: ADMIN_ID,
    editingSessionId: SECOND_SESSION_ID,
    sql,
  });
});
