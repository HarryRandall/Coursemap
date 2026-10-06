import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const fixture = vi.hoisted(() => ({ schema: "", url: "" }));
vi.mock("@/lib/admin/settings", () => ({
  loadImportModelSetting: async () => ({
    model: "test-model",
    models: [{ id: "test-model" }],
  }),
}));
vi.mock("@/lib/catalogue-runs/adapter", () => ({
  bulkImportAdapter: () => ({ parserVersion: "test-parser" }),
}));
vi.mock("@/lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: async (run) => {
    // Each preview gets the same cold client lifecycle as the hosted service.
    const client = await createLocalDatabaseClient({
      env: { COURSEMAP_DATABASE_URL: fixture.url },
    });
    const sql = Object.assign(
      (strings, ...parameters) => {
        const scoped = strings.map((part) =>
          part.replaceAll("public.", `${fixture.schema}.`),
        );
        scoped.raw = scoped;
        return client(scoped, ...parameters);
      },
      { array: client.array },
    );
    try {
      return await run(sql);
    } finally {
      await client.end();
    }
  },
}));

const { parseCourseRunOptions, previewCourseRun } =
  await import("../lib/catalogue-runs/service.ts");
let setup;

beforeAll(async () => {
  fixture.url =
    process.env.COURSEMAP_RUN_TEST_DATABASE_URL ??
    localTestEnvironment().COURSEMAP_DATABASE_URL;
  fixture.schema = `code_selection_${randomUUID().replaceAll("-", "")}`;
  setup = await createLocalDatabaseClient({
    env: { COURSEMAP_DATABASE_URL: fixture.url },
  });
  // A test-owned schema exercises selection without touching catalogue records.
  await setup.unsafe(`
    create schema ${fixture.schema};
    create table ${fixture.schema}.academic_years (id bigint, year integer);
    create table ${fixture.schema}.catalogue_codes (id bigint, code text);
    create table ${fixture.schema}.catalogue_records (
      id bigint, code_id bigint, academic_year_id bigint, kind text,
      archived_at timestamptz, latest_source_version_id bigint, published_version_id bigint
    );
    create table ${fixture.schema}.catalogue_listings (
      code_id bigint, academic_year_id bigint, is_current boolean
    );
    create table ${fixture.schema}.catalogue_drafts (record_id bigint);
    create table ${fixture.schema}.catalogue_syncs (record_id bigint, status text);
    insert into ${fixture.schema}.academic_years values (1, 2027), (2, 2026);
    insert into ${fixture.schema}.catalogue_codes values
      (1, 'ENGS-MIN'), (2, 'MTSY-MIN'), (3, 'SUSY-MIN'), (4, 'TEST-MIN'),
      (5, 'DONE-MIN'), (6, 'DRAFT-MIN'), (7, 'QUEUE-MIN');
    insert into ${fixture.schema}.catalogue_records values
      (1,1,1,'minor',null,null,null), (2,2,1,'minor',null,null,null),
      (3,3,1,'minor',null,null,null), (4,4,1,'minor',null,null,null),
      (5,5,1,'minor',null,null,1), (6,6,1,'minor',null,null,null),
      (7,7,1,'minor',null,null,null), (8,1,2,'minor',null,null,null),
      (9,1,1,'major',null,null,null);
    insert into ${fixture.schema}.catalogue_listings values
      (1,1,true), (2,1,true), (3,1,true), (4,1,true),
      (5,1,true), (6,1,true), (7,1,true), (1,2,true);
    insert into ${fixture.schema}.catalogue_drafts values (6);
    insert into ${fixture.schema}.catalogue_syncs values (7,'queued');
  `);
});

afterAll(async () => {
  if (!setup) return;
  try {
    await setup.unsafe(`drop schema ${fixture.schema} cascade`);
  } finally {
    await setup.end();
  }
});

async function preview(codes, limit = 100) {
  return previewCourseRun(
    parseCourseRunOptions({
      year: 2027,
      kind: "minor",
      codes,
      limit,
      allowAi: false,
    }),
  );
}

test("a cold preview serialises several selected codes and counts before limiting", async () => {
  const result = await preview(["ENGS-MIN", "MTSY-MIN", "SUSY-MIN"], 2);
  expect(result.records.map((row) => row.code)).toEqual([
    "ENGS-MIN",
    "MTSY-MIN",
  ]);
  expect(result.availableCount).toBe(3);
  expect(result.count).toBe(2);
  expect(result.estimateKind).toBe("not_used");
});

test("a cold preview serialises one selected code", async () => {
  expect((await preview(["SUSY-MIN"])).records).toEqual([
    { id: 3, code: "SUSY-MIN" },
  ]);
});

test("a blank filter retains all eligible records for the selected year and kind", async () => {
  const result = await preview(undefined);
  expect(result.records.map((row) => row.code)).toEqual([
    "ENGS-MIN",
    "MTSY-MIN",
    "SUSY-MIN",
    "TEST-MIN",
  ]);
  expect(result.availableCount).toBe(4);
});

test("unknown or ineligible selected codes cannot broaden the run", async () => {
  const result = await preview([
    "NONE-MIN",
    "DONE-MIN",
    "DRAFT-MIN",
    "QUEUE-MIN",
  ]);
  expect(result.records).toEqual([]);
  expect(result.availableCount).toBe(0);
});
