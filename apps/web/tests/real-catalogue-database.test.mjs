import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../lib/catalogue-import/version-content.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import {
  readRealCatalogue,
  seedRealCatalogue,
} from "../scripts/local/real-catalogue.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

// The captured course under a code of its own, so a developer's local copy of
// the real record is never touched.
const CODE = "TSTR4528";

let sql;

async function removeFixture() {
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  await sql`alter table public.catalogue_publications disable trigger catalogue_publications_guard_history`;
  await sql`alter table public.catalogue_change_events disable trigger catalogue_change_events_reject_mutation`;
  await sql`alter table public.catalogue_field_changes disable trigger catalogue_field_changes_reject_mutation`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code = ${CODE}`;
  } finally {
    await sql`alter table public.catalogue_field_changes enable trigger catalogue_field_changes_reject_mutation`;
    await sql`alter table public.catalogue_change_events enable trigger catalogue_change_events_reject_mutation`;
    await sql`alter table public.catalogue_publications enable trigger catalogue_publications_guard_history`;
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
  }
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
  });
  sql = await createLocalDatabaseClient();
  await removeFixture();
});

afterAll(async () => {
  if (!sql) return;
  await removeFixture();
  await sql.end({ timeout: 5 });
});

test("captured real content publishes once and reads back unchanged", async () => {
  const captured = (await readRealCatalogue()).find(
    (content) => content.kind === "course",
  );
  assert.ok(captured, "The fixture holds at least one real course.");
  const content = { ...structuredClone(captured), code: CODE };

  assert.equal(await seedRealCatalogue(sql, [content]), 1);
  assert.equal(await seedRealCatalogue(sql, [content]), 0);

  const [record] = await sql`
    select records.published_version_id
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.kind = 'course' and codes.code = ${CODE}
  `;
  const stored = await readVersionContent(
    sql,
    Number(record.published_version_id),
  );
  assert.equal(
    contentHashForCatalogueContent(stored),
    contentHashForCatalogueContent(content),
  );
});
