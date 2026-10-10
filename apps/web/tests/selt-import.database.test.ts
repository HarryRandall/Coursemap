import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import {
  createSeltRun,
  importSeltReport,
  publishSeltReport,
  withSeltToken,
} from "../lib/selt/store";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { syntheticSeltReport } from "./fixtures/selt/report";
let sql: Awaited<ReturnType<typeof createLocalDatabaseClient>>;
const userId = randomUUID();
let codeId: number;
beforeAll(async () => {
  const url =
    process.env.COURSEMAP_RUN_TEST_DATABASE_URL ??
    localTestEnvironment().COURSEMAP_DATABASE_URL;
  if (!url) throw new Error("A task-owned local test database is required.");
  sql = await createLocalDatabaseClient({
    env: { COURSEMAP_DATABASE_URL: url },
  });
  await sql`insert into auth.users (id) values (${userId})`;
  await sql`insert into private.user_roles (user_id, role_id) select ${userId}, id from private.app_roles where key = 'admin' on conflict (user_id) do update set role_id = excluded.role_id`;
  const [code] =
    await sql`insert into public.catalogue_codes (kind, code) values ('course','TEST1234') returning id`;
  codeId = Number(code!.id);
});
afterAll(async () => {
  if (!sql || codeId === undefined) return;
  await sql`delete from public.selt_reports where code_id = ${codeId}`;
  await sql`delete from public.selt_import_runs where requested_by = ${userId}`;
  await sql`delete from public.catalogue_codes where id = ${codeId}`;
  await sql`delete from auth.users where id = ${userId}`;
  await sql.end();
});
it("stores one complete report atomically and makes retries idempotent", async () => {
  const run = await createSeltRun(sql, userId);
  const report = syntheticSeltReport();
  const first = await importSeltReport(sql, run.token, report);
  expect(first.outcome).toBe("imported");
  expect((await importSeltReport(sql, run.token, report)).outcome).toBe(
    "unchanged",
  );
  const [counts] =
    await sql`select (select count(*)::integer from public.selt_surveys where report_id = ${first.id!}) as surveys, (select count(*)::integer from public.selt_question_themes where report_id = ${first.id!}) as themes`;
  expect(counts).toMatchObject({ surveys: 1, themes: 5 });
  await sql`update public.selt_import_runs set revoked_at = now() where id = ${run.id}`;
  await expect(importSeltReport(sql, run.token, report)).rejects.toThrow(
    "invalid, expired or revoked",
  );
});
it("rejects expired tokens and tokens whose issuer loses permission", async () => {
  const expired = await createSeltRun(sql, userId);
  await sql`update public.selt_import_runs set expires_at = now() - interval '1 minute' where id = ${expired.id}`;
  await expect(
    withSeltToken(sql, expired.token, async () => true),
  ).rejects.toThrow();
  const live = await createSeltRun(sql, userId);
  await sql`delete from private.user_roles where user_id = ${userId}`;
  await expect(
    withSeltToken(sql, live.token, async () => true),
  ).rejects.toThrow();
  await sql`insert into private.user_roles (user_id, role_id) select ${userId}, id from private.app_roles where key='admin'`;
});
it("rolls back invalid survey inserts and blocks publication with warnings", async () => {
  const run = await createSeltRun(sql, userId);
  const invalid = syntheticSeltReport();
  invalid.source.sha256 = "b".repeat(64);
  invalid.surveys[0]!.respondents = 1;
  await expect(importSeltReport(sql, run.token, invalid)).rejects.toThrow();
  const [count] =
    await sql`select count(*)::integer as total from public.selt_reports where source_sha256 = ${invalid.source.sha256}`;
  expect(count!.total).toBe(0);
  const held = syntheticSeltReport();
  held.source.sha256 = "c".repeat(64);
  held.extraction.warnings.push("Check the source chart.");
  const saved = await importSeltReport(sql, run.token, held);
  await expect(publishSeltReport(sql, saved.id!, userId)).rejects.toThrow(
    "Resolve extraction warnings",
  );
});
it("publishes one report per course and hides it from students until catalogue publication", async () => {
  const run = await createSeltRun(sql, userId);
  const report = syntheticSeltReport();
  report.source.sha256 = "d".repeat(64);
  const saved = await importSeltReport(sql, run.token, report);
  await publishSeltReport(sql, saved.id!, userId);
  const next = syntheticSeltReport();
  next.source.sha256 = "e".repeat(64);
  const replacement = await importSeltReport(sql, run.token, next);
  await publishSeltReport(sql, replacement.id!, userId);
  const [published] =
    await sql`select count(*)::integer as total from public.selt_reports where code_id = ${codeId} and published_at is not null`;
  expect(published!.total).toBe(1);
  await sql
    .begin(async (tx) => {
      await tx`set local role authenticated`;
      expect(
        await tx`select id from public.selt_reports where code_id = ${codeId}`,
      ).toEqual([]);
      expect(
        await tx`select report_id from public.selt_surveys where report_id = ${replacement.id!}`,
      ).toEqual([]);
      expect(
        await tx`select key from public.selt_question_themes where report_id = ${replacement.id!}`,
      ).toEqual([]);
      await tx`reset role`;
      await tx.unsafe(
        await readFile(
          new URL(
            "../../../supabase/tests/helpers/catalogue-fixtures.inc",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await tx`select pg_temp.publish_course('TEST1234'::text, 2027::smallint)`;
      await tx`set local role authenticated`;
      expect(
        await tx`select id from public.selt_reports where code_id = ${codeId}`,
      ).toEqual([{ id: replacement.id }]);
      expect(
        await tx`select report_id from public.selt_surveys where report_id in (${saved.id!}, ${replacement.id!})`,
      ).toEqual([{ report_id: replacement.id }]);
      expect(
        await tx`select key from public.selt_question_themes where report_id = ${replacement.id!}`,
      ).toHaveLength(5);
      expect(
        await tx`select key from public.selt_question_themes where report_id = ${saved.id!}`,
      ).toEqual([]);
      await expect(tx`select * from public.selt_import_runs`).rejects.toThrow();
    })
    .catch((error) => {
      if (!String(error).includes("permission denied")) throw error;
    });
  await sql
    .begin(async (tx) => {
      await tx`set local role anon`;
      await expect(tx`select * from public.selt_reports`).rejects.toThrow();
    })
    .catch((error) => {
      if (!String(error).includes("permission denied")) throw error;
    });
});
