import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, test, expect } from "vitest";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import {
  reserveCourseRunSpend,
  settleCourseRunSpend,
  courseRunAllowance,
} from "../lib/catalogue-runs/budget.ts";

let sql;
const runIds = [];
const codeIds = [];
let userId;
let yearId;

beforeAll(async () => {
  const url =
    process.env.COURSEMAP_RUN_TEST_DATABASE_URL ??
    localTestEnvironment().COURSEMAP_DATABASE_URL;
  if (!url)
    throw new Error(
      "Use a task-owned local database with migration 034 for run budget tests.",
    );
  sql = await createLocalDatabaseClient({
    env: { COURSEMAP_DATABASE_URL: url },
  });
  const [user] =
    await sql`insert into auth.users (id) values (${randomUUID()}::uuid) returning id`;
  userId = user.id;
  const [year] =
    await sql`select id from public.academic_years where year = 2026`;
  yearId = year.id;
});

afterAll(async () => {
  if (!sql) return;
  await sql`delete from public.catalogue_course_run_items where run_id = any(${sql.array(runIds)}::uuid[])`;
  await sql`delete from public.catalogue_course_runs where id = any(${sql.array(runIds)}::uuid[])`;
  await sql`delete from public.catalogue_codes where id = any(${sql.array(codeIds)}::bigint[])`;
  if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end();
});

async function fixture(budget, count = 2) {
  const [run] =
    await sql`insert into public.catalogue_course_runs (academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million) values (2026, ${userId}::uuid, 'google/gemini-3.1-flash-lite', ${count}, ${budget}, 0.25, 1.5) returning id`;
  runIds.push(run.id);
  const syncIds = [];
  for (let i = 0; i < count; i++) {
    const code = `BTST${String(1000 + codeIds.length)}`;
    const [identity] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
    codeIds.push(identity.id);
    const [record] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${yearId}) returning id`;
    const [sync] =
      await sql`insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version) values (${record.id}, 'manual', 'google/gemini-3.1-flash-lite', 'test', 'test', 'test') returning id`;
    await sql`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${run.id}::uuid, ${record.id}, ${sync.id}::uuid)`;
    syncIds.push(sync.id);
  }
  return { runId: run.id, syncIds };
}

test("concurrent reservations cannot both spend the last allowance", async () => {
  const allowance = courseRunAllowance(0.25, 1.5);
  const { syncIds } = await fixture(allowance);
  const results = await Promise.allSettled(
    syncIds.map((syncId) => reserveCourseRunSpend(sql, syncId, 1000)),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
});

test("settled cost releases unused allowance and repeated settlement is idempotent", async () => {
  const { syncIds } = await fixture(0.01);
  await reserveCourseRunSpend(sql, syncIds[0], 1000);
  await settleCourseRunSpend(sql, syncIds[0], 0.001);
  await settleCourseRunSpend(sql, syncIds[0], 0.001);
  await reserveCourseRunSpend(sql, syncIds[1], 1000);
  const [item] =
    await sql`select actual_usd from public.catalogue_course_run_items where sync_id = ${syncIds[0]}::uuid`;
  expect(Number(item.actual_usd)).toBe(0.001);
});

test("unknown provider cost pauses the whole run and prevents another request", async () => {
  const { runId, syncIds } = await fixture(0.5);
  await reserveCourseRunSpend(sql, syncIds[0], 1000);
  await settleCourseRunSpend(sql, syncIds[0], null);
  const [run] =
    await sql`select state from public.catalogue_course_runs where id = ${runId}::uuid`;
  expect(run.state).toBe("paused");
  await expect(reserveCourseRunSpend(sql, syncIds[1], 1000)).rejects.toThrow(
    "stopped",
  );
});

test("oversized inputs and cancelled runs cannot reserve paid work", async () => {
  const { runId, syncIds } = await fixture(0.5);
  await expect(reserveCourseRunSpend(sql, syncIds[0], 20001)).rejects.toThrow(
    "input cap",
  );
  await sql`update public.catalogue_course_runs set state = 'cancelled' where id = ${runId}::uuid`;
  await expect(reserveCourseRunSpend(sql, syncIds[0], 1000)).rejects.toThrow(
    "stopped",
  );
});

test("ordinary authenticated users cannot read or mutate import runs", async () => {
  const { runId } = await fixture(0.5, 1);
  await sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${userId}::text, true)`;
    const rows =
      await tx`select id from public.catalogue_course_runs where id = ${runId}::uuid`;
    expect(rows).toHaveLength(0);
  });
  await expect(
    sql.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`update public.catalogue_course_runs set state = 'active' where id = ${runId}::uuid`;
    }),
  ).rejects.toThrow("permission denied");
});

test("catalogue-wide selection no longer has a 100-course database cap", async () => {
  const { runId } = await fixture(0.5, 1);
  const [run] =
    await sql`update public.catalogue_course_runs set course_limit = 3500 where id = ${runId}::uuid returning course_limit`;
  expect(Number(run.course_limit)).toBe(3500);
});
