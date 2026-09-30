#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { insertVersionContent } from "../../lib/catalogue-sync/persist-source-version.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../../lib/catalogue-import/version-content.ts";
import { createLocalDatabaseClient } from "../catalogue/lib/local-database.mjs";

export const REAL_CATALOGUE_PATH = new URL(
  "../fixtures/real-catalogue.json",
  import.meta.url,
);

/**
 * Publishes reviewed catalogue content captured from real ANU records, so a
 * reset preview has real degrees beside the synthetic fixtures. A record that
 * already has a published version is left alone, which keeps reseeding safe.
 * Returns the number of records published.
 */
export async function seedRealCatalogue(sql, contents) {
  let published = 0;
  for (const content of contents) {
    const created = await sql.begin(async (tx) => {
      const [year] = await tx`
        select id from public.academic_years where year = ${content.academicYear}
      `;
      if (!year)
        throw new Error(
          `The academic year ${content.academicYear} is not registered.`,
        );
      const [code] = await tx`
        insert into public.catalogue_codes (kind, code)
        values (${content.kind}, ${content.code})
        on conflict (kind, code) do update set code = excluded.code
        returning id
      `;
      const [record] = await tx`
        insert into public.catalogue_records (code_id, kind, academic_year_id)
        values (${code.id}, ${content.kind}, ${year.id})
        on conflict (code_id, academic_year_id)
          do update set kind = excluded.kind
        returning id, published_version_id
      `;
      if (record.published_version_id !== null) return false;
      const [version] = await tx`
        insert into public.catalogue_versions (
          record_id, kind, academic_year_id, origin, content_hash
        ) values (
          ${record.id}, ${content.kind}, ${year.id}, 'manual',
          ${contentHashForCatalogueContent(content)}
        )
        returning id
      `;
      await insertVersionContent(tx, {
        snapshotId: Number(version.id),
        kind: content.kind,
        academicYearId: Number(year.id),
        sourcePageId: null,
        write: content,
      });
      await tx`
        update public.catalogue_versions
        set sealed_at = greatest(statement_timestamp(), created_at)
        where id = ${version.id}
      `;
      await tx`
        update public.catalogue_records
        set published_version_id = ${version.id}, updated_at = now()
        where id = ${record.id}
      `;
      return true;
    });
    if (created) published += 1;
  }
  return published;
}

export async function readRealCatalogue(readSeed = readFile) {
  return JSON.parse(await readSeed(REAL_CATALOGUE_PATH, "utf8"));
}

/**
 * Captures the published versions of `kind:CODE:year` records from the local
 * database into the fixture. Evidence and review flags are dropped: the seed
 * holds reviewed content, not the reading that produced it.
 */
export async function exportRealCatalogue(sql, selections) {
  const contents = [];
  for (const selection of selections) {
    const [kind, code, year] = selection.split(":");
    const [record] = await sql`
      select records.published_version_id
      from public.catalogue_records as records
      join public.catalogue_codes as codes on codes.id = records.code_id
      join public.academic_years as years on years.id = records.academic_year_id
      where codes.kind = ${kind} and codes.code = ${code}
        and years.year = ${Number(year)}
    `;
    if (!record?.published_version_id)
      throw new Error(`${selection} has no published version to export.`);
    const content = await readVersionContent(
      sql,
      Number(record.published_version_id),
    );
    contents.push({ ...content, evidence: [], flags: [] });
  }
  return contents;
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isMainModule) {
  const selections = process.argv.slice(2);
  if (selections.length === 0) {
    console.error(
      "Name the published records to capture, for example programme:BCOMP:2026 course:COMP4528:2026.",
    );
    process.exit(1);
  }
  const sql = await createLocalDatabaseClient();
  try {
    const contents = await exportRealCatalogue(sql, selections);
    await writeFile(
      REAL_CATALOGUE_PATH,
      `${JSON.stringify(contents, null, 2)}\n`,
    );
    console.log(`Captured ${contents.length} records.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
