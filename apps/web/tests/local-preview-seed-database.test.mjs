import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const previewSeed = await readFile(
  new URL("../scripts/fixtures/local-preview.sql", import.meta.url),
  "utf8",
);
const seedInsideTransaction = previewSeed
  .replace(/\nbegin;\n/u, "\n")
  .replace(/\ncommit;\s*$/u, "\n");

test("the local preview seed leaves unrelated course records unpublished", async () => {
  const sql = await createLocalDatabaseClient({ env: localTestEnvironment() });
  const rollback = new Error("Roll back the local preview isolation test.");
  try {
    await assert.rejects(
      sql.begin(async (tx) => {
        const [year] = await tx`
          select id from public.academic_years where year = 2026
        `;
        const [code] = await tx`
          insert into public.catalogue_codes (kind, code)
          values ('course', 'TSTC9707') returning id
        `;
        const [record] = await tx`
          insert into public.catalogue_records (code_id, kind, academic_year_id)
          values (${code.id}, 'course', ${year.id}) returning id
        `;

        await tx.unsafe(seedInsideTransaction);

        const [state] = await tx`
          select records.published_version_id,
            (select count(*) from public.catalogue_versions
             where record_id = records.id) as version_count
          from public.catalogue_records as records
          where records.id = ${record.id}
        `;
        assert.equal(state.published_version_id, null);
        assert.equal(Number(state.version_count), 0);
        throw rollback;
      }),
      (error) => error === rollback,
    );
  } finally {
    await sql.end();
  }
});
