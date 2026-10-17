import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import {
  applyYearLoad,
  exportYearBundle,
  planYearLoad,
} from "../scripts/catalogue/lib/year-bundle.mjs";
import { readRealCatalogue } from "../scripts/local/real-catalogue.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

// A year and code no developer data uses, so a load never reaches real records.
const YEAR = 2030;
const CODE = "TSTL4528";

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

test("a year bundle publishes, then skips unchanged records, then unpublishes omitted ones", async () => {
  const captured = (await readRealCatalogue()).find(
    (content) => content.kind === "course",
  );
  const record = {
    ...structuredClone(captured),
    code: CODE,
    academicYear: YEAR,
  };
  const bundle = { year: YEAR, kinds: ["course"], records: [record] };

  const first = await planYearLoad(sql, bundle);
  assert.deepEqual(
    [first.publish, first.unchanged, first.unpublish],
    [[`course:${CODE}`], [], []],
  );
  assert.deepEqual(await applyYearLoad(sql, bundle, { token: first.token }), {
    published: 1,
    unpublished: 0,
    draftsCleared: 0,
  });

  assert.deepEqual((await planYearLoad(sql, bundle)).publish, []);

  // Reading content back normalises it, so an exported bundle is loaded once
  // and then reproduces itself exactly.
  const exported = await exportYearBundle(sql, {
    year: YEAR,
    kinds: ["course"],
  });
  assert.deepEqual(
    exported.records.map((item) => item.code),
    [CODE],
  );
  const reload = await planYearLoad(sql, exported);
  await applyYearLoad(sql, exported, { token: reload.token });
  const again = await exportYearBundle(sql, { year: YEAR, kinds: ["course"] });
  const second = await planYearLoad(sql, again);
  assert.deepEqual(
    [second.publish, second.unchanged],
    [[], [`course:${CODE}`]],
  );

  const empty = { ...bundle, records: [] };
  const third = await planYearLoad(sql, empty);
  assert.deepEqual(third.unpublish, [`course:${CODE}`]);
  await assert.rejects(
    applyYearLoad(sql, empty, { token: first.token }),
    /no longer matches the reviewed plan/,
  );
  assert.equal(
    (await applyYearLoad(sql, empty, { token: third.token })).unpublished,
    1,
  );
  const [row] = await sql`
    select records.published_version_id from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    where codes.code = ${CODE}
  `;
  assert.equal(row.published_version_id, null);
});
