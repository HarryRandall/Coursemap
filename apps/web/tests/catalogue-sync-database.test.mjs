import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import {
  emptyCatalogueContent,
  CATALOGUE_CONTENT_SCHEMA_VERSION,
} from "../lib/catalogue/content.ts";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content.ts";
import { persistSourceVersion } from "../lib/catalogue-sync/persist-source-version.ts";
import { ensureAnuSourceId } from "../lib/catalogue-sync/sync-store.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const YEAR = 2026;
const EMPTY_CODE = "TSTC9101";
const MANUAL_CODE = "TSTC9102";

let sql;
let yearId;
let sourceId;
const records = new Map();

function sourceContent(code, title, description) {
  const content = emptyCatalogueContent({
    kind: "course",
    code,
    academicYear: YEAR,
    title,
  });
  content.course.details.description = description;
  content.contentHash = contentHashForCatalogueContent(content);
  return content;
}

async function removeFixtures() {
  await sql`delete from public.catalogue_listings where code in (${EMPTY_CODE}, ${MANUAL_CODE})`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code in (${EMPTY_CODE}, ${MANUAL_CODE})`;
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

async function createSyncFixture(code, contentHash) {
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
  const [insertedDocument] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key,
      canonical_url, content_sha256, http_status, fetched_at
    ) values (
      ${sourceId}, ${recordId}, ${yearId}, 'course', ${code},
      ${`https://programsandcourses.anu.edu.au/course/${code}`},
      ${contentHash}, 200, now()
    ) on conflict (source_id, record_id, content_sha256) do nothing
    returning id
  `;
  const [document] = insertedDocument
    ? [insertedDocument]
    : await sql`
        select id from public.catalogue_source_documents
        where source_id = ${sourceId} and record_id = ${recordId}
          and content_sha256 = ${contentHash}
      `;
  return {
    documentId: Number(document.id),
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
  };
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
  });
  sql = await createLocalDatabaseClient();
  await removeFixtures();
  [{ id: yearId }] = await sql`
    select id from public.academic_years where year = ${YEAR}
  `;
  sourceId = await ensureAnuSourceId(sql);
  await createRecord(EMPTY_CODE, "Empty Source Record");
  await createRecord(MANUAL_CODE, "Manual Source Record");
});

afterAll(async () => {
  if (!sql) return;
  await removeFixtures();
  await sql.end({ timeout: 5 });
});

test("first, unchanged and changed source observations preserve local intent", async () => {
  const emptyRecordId = records.get(EMPTY_CODE);
  const emptyDraft = emptyCatalogueContent({
    kind: "course",
    code: EMPTY_CODE,
    academicYear: YEAR,
    title: "Empty Source Record",
  });
  emptyDraft.contentHash = contentHashForCatalogueContent(emptyDraft);
  await sql`
    insert into public.catalogue_drafts (
      record_id, content, content_hash, content_schema_version, revision
    ) values (${emptyRecordId}, ${sql.json(emptyDraft)}, ${emptyDraft.contentHash},
      ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 0)
  `;

  const firstContent = sourceContent(
    EMPTY_CODE,
    "Empty Source Record",
    "First ANU description.",
  );
  const firstFixture = await createSyncFixture(EMPTY_CODE, "1".repeat(64));
  const first = await persistSourceVersion(sql, {
    claim: firstFixture.claim,
    sourceDocumentId: firstFixture.documentId,
    write: firstContent,
  });
  assert.equal(first.status, "applied");
  assert.equal(first.populatedDraft, true);
  const replayedFirst = await persistSourceVersion(sql, {
    claim: firstFixture.claim,
    sourceDocumentId: firstFixture.documentId,
    write: firstContent,
  });
  assert.deepEqual(replayedFirst, first);
  const [firstVersionCount] = await sql`
    select count(*)::integer as count from public.catalogue_versions
    where sync_id = ${firstFixture.claim.syncId}
  `;
  assert.equal(firstVersionCount.count, 1);
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now()
    where id = ${firstFixture.claim.syncId}`;
  const [populated] = await sql`
    select content, base_version_id from public.catalogue_drafts where record_id = ${emptyRecordId}
  `;
  assert.equal(
    populated.content.course.details.description,
    "First ANU description.",
  );
  assert.equal(Number(populated.base_version_id), first.sourceVersionId);

  const unchangedFixture = await createSyncFixture(EMPTY_CODE, "1".repeat(64));
  const unchanged = await persistSourceVersion(sql, {
    claim: unchangedFixture.claim,
    sourceDocumentId: unchangedFixture.documentId,
    write: firstContent,
  });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.sourceVersionId, first.sourceVersionId);
  await sql`update public.catalogue_syncs set status = 'unchanged', completed_at = now()
    where id = ${unchangedFixture.claim.syncId}`;

  const changedContent = sourceContent(
    EMPTY_CODE,
    "Empty Source Record",
    "Changed ANU description.",
  );
  const changedFixture = await createSyncFixture(EMPTY_CODE, "2".repeat(64));
  const changed = await persistSourceVersion(sql, {
    claim: changedFixture.claim,
    sourceDocumentId: changedFixture.documentId,
    write: changedContent,
  });
  assert.equal(changed.status, "review_required");
  const [unchangedDraft] = await sql`
    select content from public.catalogue_drafts where record_id = ${emptyRecordId}
  `;
  assert.equal(
    unchangedDraft.content.course.details.description,
    "First ANU description.",
  );

  const manualRecordId = records.get(MANUAL_CODE);
  const manualDraft = sourceContent(
    MANUAL_CODE,
    "Manual Source Record",
    "Locally authored description.",
  );
  await sql`
    insert into public.catalogue_drafts (
      record_id, content, content_hash, content_schema_version, revision
    ) values (${manualRecordId}, ${sql.json(manualDraft)}, ${manualDraft.contentHash},
      ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 1)
  `;
  const manualFirstContent = sourceContent(
    MANUAL_CODE,
    "Manual Source Record",
    "ANU description.",
  );
  const manualFixture = await createSyncFixture(MANUAL_CODE, "3".repeat(64));
  const manualFirst = await persistSourceVersion(sql, {
    claim: manualFixture.claim,
    sourceDocumentId: manualFixture.documentId,
    write: manualFirstContent,
  });
  assert.equal(manualFirst.status, "review_required");
  const [manualStillLocal] = await sql`
    select content from public.catalogue_drafts where record_id = ${manualRecordId}
  `;
  assert.equal(
    manualStillLocal.content.course.details.description,
    "Locally authored description.",
  );
});
