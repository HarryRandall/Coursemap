import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, test } from "vitest";

import { processImportTarget } from "../lib/catalogue-import/process-target.ts";
import { adapterForKind } from "../lib/catalogue-import/process-target.ts";
import { processImportRunInline } from "../lib/catalogue-import/queue.ts";
import { extractDeterministicCourse } from "../lib/catalogue-import/kinds/course/deterministic.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const ADMIN_ID = "98000000-0000-4000-8000-000000000001";
const CODE = "COMP2400";
const YEAR = 2026;
const sourceUrl = `https://programsandcourses.anu.edu.au/${YEAR}/course/${CODE}`;
const fixtureHtml = await readFile(
  new URL(
    "./fixtures/course-import/anu-2026-comp2400-rich.html",
    import.meta.url,
  ),
  "utf8",
);

// The canned model answer is the deterministic extraction itself, so the merge
// sees a valid, evidence-backed response without a paid request.
const deterministicAnswer = extractDeterministicCourse({
  html: fixtureHtml,
  courseCode: CODE,
  year: YEAR,
  sourceUrl,
});
const modelAnswer = {
  ...deterministicAnswer,
  evidence: deterministicAnswer.evidence.map((item) => ({
    ...item,
    method: "model",
  })),
};

let openRouterCalls = 0;
const realFetch = globalThis.fetch;

function stubbedFetch(input, init) {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://programsandcourses.anu.edu.au/")) {
    return Promise.resolve(
      new Response(fixtureHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
  if (url.startsWith("https://openrouter.ai/")) {
    openRouterCalls += 1;
    return Promise.resolve(
      Response.json({
        id: "gen-test",
        model: "test/model",
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(modelAnswer) },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost: 0.001,
        },
      }),
    );
  }
  return realFetch(input, init);
}

let sql;

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    OPENROUTER_API_KEY: "sk-or-v1-test",
    NODE_ENV: "development",
  });
  globalThis.fetch = stubbedFetch;
  sql = await createLocalDatabaseClient();
  await sql`
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', ${ADMIN_ID}, 'authenticated', 'authenticated',
      'pipeline-admin@example.test', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    on conflict (id) do nothing
  `;
  await sql`
    insert into private.user_roles (user_id, role_id)
    select ${ADMIN_ID}, id from private.app_roles where key = 'admin'
    on conflict (user_id) do update set role_id = excluded.role_id
  `;
  await sql`
    insert into public.import_models (id, name, provider, input_usd_per_million, output_usd_per_million)
    values ('test/model', 'Test model', 'Test', 0.1, 0.2)
    on conflict (id) do update set enabled = true, visible = true
  `;
  await removeFixtureData();
});

/**
 * Removes the fixture identities. Snapshots refuse deletes by design, so the
 * cleanup briefly disables that trigger; production never deletes them.
 */
async function removeFixtureData() {
  await sql`delete from public.catalogue_import_runs where requested_by = ${ADMIN_ID}`;
  await sql`update public.catalogue_directory_entries set item_id = null where code in (${CODE}, 'COMP2401')`;
  await sql`alter table public.catalogue_snapshots disable trigger catalogue_snapshots_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_items where kind = 'course' and code in (${CODE}, 'COMP2401')`;
    await sql`
      delete from public.catalogue_items
      where kind = 'course'
        and id not in (select item_id from public.catalogue_item_years)
        and id not in (select item_id from public.requirement_conditions where item_id is not null)
        and id not in (select item_id from public.requirement_condition_options where item_id is not null)
        and id not in (select item_id from public.requirement_item_references)
        and id not in (select related_course_id from public.course_related_courses)
        and code not in ('MATH1005')
    `;
  } finally {
    await sql`alter table public.catalogue_snapshots enable trigger catalogue_snapshots_enforce_immutability`;
  }
}

afterAll(async () => {
  globalThis.fetch = realFetch;
  if (sql) {
    await removeFixtureData();
    await sql`delete from auth.users where id = ${ADMIN_ID}`;
    await sql.end({ timeout: 5 });
  }
});

async function startRun(codes) {
  const adapter = adapterForKind("course");
  const [row] = await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${ADMIN_ID}, true)`;
    return tx`
      select public.start_catalogue_import(
        ${YEAR}::smallint, 'course', ${tx.array(codes)}::text[], 'test/model',
        ${adapter.parserVersion}, ${adapter.promptVersion}, ${adapter.schemaVersion}
      ) as run
    `;
  });
  return row.run;
}

test("a first import becomes the draft and a repeat import is unchanged", async () => {
  const run = await startRun([CODE]);
  assert.equal(run.targets.length, 1);
  const targetId = run.targets[0].targetId;

  await processImportTarget({ runId: run.runId, targetId });

  const [target] = await sql`
    select status, change_kind, candidate_snapshot_id, error_message
    from public.catalogue_import_targets where id = ${targetId}::uuid
  `;
  assert.equal(target.error_message, null);
  assert.equal(target.status, "ready");
  assert.equal(target.change_kind, "new");
  assert.ok(target.candidate_snapshot_id);
  assert.equal(openRouterCalls, 1);

  const [itemYear] = await sql`
    select item_years.draft_snapshot_id, item_years.published_snapshot_id
    from public.catalogue_item_years as item_years
    join public.catalogue_items as items on items.id = item_years.item_id
    where items.code = ${CODE}
  `;
  assert.equal(
    Number(itemYear.draft_snapshot_id),
    Number(target.candidate_snapshot_id),
  );
  assert.equal(itemYear.published_snapshot_id, null);

  const [details] = await sql`
    select title, units, subject_code from public.course_snapshot_details
    where snapshot_id = ${target.candidate_snapshot_id}
  `;
  assert.equal(details.subject_code, "COMP");
  assert.ok(details.title.length > 0);

  const [{ count: stageCount }] = await sql`
    select count(*)::int as count from public.catalogue_import_stages
    where target_id = ${targetId}::uuid and status = 'completed'
  `;
  assert.equal(stageCount, 10);

  const [extraction] = await sql`
    select validation_status, schema_valid, domain_valid, error_count, warning_count
    from public.catalogue_extractions where target_id = ${targetId}::uuid
  `;
  assert.equal(
    extraction.schema_valid,
    true,
    "the canned model answer passes the contract",
  );

  const [{ count: rules }] = await sql`
    select count(*)::int as count from public.requirement_rules
    where snapshot_id = ${target.candidate_snapshot_id}
  `;
  assert.ok(rules >= 1, "the fixture page carries requisite rules");

  const [runRow] = await sql`
    select status, completed_count, cost_usd from public.catalogue_import_runs where id = ${run.runId}::uuid
  `;
  assert.equal(runRow.status, "completed");
  assert.equal(runRow.completed_count, 1);
  assert.equal(Number(runRow.cost_usd), 0.001);

  // A second run over identical content reuses the validated response and
  // records no new snapshot.
  const secondRun = await startRun([CODE]);
  const { completed } = await processImportRunInline({
    runId: secondRun.runId,
  });
  assert.equal(completed, 1);
  const [second] = await sql`
    select status, change_kind, candidate_snapshot_id from public.catalogue_import_targets
    where run_id = ${secondRun.runId}::uuid
  `;
  assert.equal(second.status, "unchanged");
  assert.equal(second.change_kind, "unchanged");
  assert.equal(second.candidate_snapshot_id, null);
  assert.equal(
    openRouterCalls,
    1,
    "identical input does not pay for a second model call",
  );
});

test("a run refuses a second unfinished target for the same item year", async () => {
  const run = await startRun(["COMP2401"]);
  await assert.rejects(startRun(["COMP2401"]), /unfinished import/);
  await sql`delete from public.catalogue_import_runs where id = ${run.runId}::uuid`;
});
