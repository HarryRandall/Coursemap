import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, test } from "vitest";

import { processImportTarget } from "../lib/catalogue-import/process-target.ts";
import { adapterForKind } from "../lib/catalogue-import/process-target.ts";
import { processImportRunInline } from "../lib/catalogue-import/queue.ts";
import { applyImportReview } from "../lib/catalogue-import/apply-review.ts";
import { extractDeterministicCourse } from "../lib/catalogue-import/kinds/course/deterministic.ts";
import { reconcileCatalogueListings } from "../lib/catalogue-import/directory.ts";
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
const modelAnswerRef = { current: modelAnswer };

let openRouterCalls = 0;
const realFetch = globalThis.fetch;

const pageRef = { current: fixtureHtml };

function stubbedFetch(input, init) {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://programsandcourses.anu.edu.au/")) {
    return Promise.resolve(
      new Response(pageRef.current, {
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
            message: { content: JSON.stringify(modelAnswerRef.current) },
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
  await sql`delete from public.catalogue_listings where code in (${CODE}, 'COMP2401')`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code in (${CODE}, 'COMP2401')`;
    await sql`
      delete from public.catalogue_codes
      where kind = 'course'
        and id not in (select code_id from public.catalogue_records)
        and id not in (select code_id from public.requirement_conditions where code_id is not null)
        and id not in (select code_id from public.requirement_condition_options where code_id is not null)
        and id not in (select code_id from public.requirement_item_references)
        and id not in (select related_course_id from public.course_related_courses)
        and code not in ('MATH1005')
    `;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
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

test("catalogue discovery creates records and only complete listings mark disappearances", async () => {
  const [year] =
    await sql`select id from public.academic_years where year = ${YEAR}`;
  const entries = [
    { code: CODE, title: "Relational Databases", summary: {} },
    { code: "COMP2401", title: "Computer Systems", summary: {} },
  ];

  const first = await sql.begin((tx) =>
    reconcileCatalogueListings(tx, {
      academicYearId: Number(year.id),
      kind: "course",
      entries,
      isComplete: true,
    }),
  );
  assert.equal(first.added, 2);

  const repeated = await sql.begin((tx) =>
    reconcileCatalogueListings(tx, {
      academicYearId: Number(year.id),
      kind: "course",
      entries,
      isComplete: true,
    }),
  );
  assert.equal(repeated.added, 0);
  assert.equal(repeated.updated, 2);

  await sql.begin((tx) =>
    reconcileCatalogueListings(tx, {
      academicYearId: Number(year.id),
      kind: "course",
      entries: entries.slice(0, 1),
      isComplete: false,
    }),
  );
  let [missing] = await sql`
    select listings.is_current, listings.record_id, records.archived_at,
      records.published_version_id
    from public.catalogue_listings as listings
    join public.catalogue_records as records on records.id = listings.record_id
    where listings.code = 'COMP2401' and listings.academic_year_id = ${year.id}
  `;
  assert.equal(missing.is_current, true);

  await sql.begin((tx) =>
    reconcileCatalogueListings(tx, {
      academicYearId: Number(year.id),
      kind: "course",
      entries: entries.slice(0, 1),
      isComplete: true,
    }),
  );
  [missing] = await sql`
    select listings.is_current, listings.record_id, records.archived_at,
      records.published_version_id
    from public.catalogue_listings as listings
    join public.catalogue_records as records on records.id = listings.record_id
    where listings.code = 'COMP2401' and listings.academic_year_id = ${year.id}
  `;
  assert.equal(missing.is_current, false);
  assert.ok(missing.record_id);
  assert.equal(missing.archived_at, null);
  assert.equal(missing.published_version_id, null);

  await sql.begin((tx) =>
    reconcileCatalogueListings(tx, {
      academicYearId: Number(year.id),
      kind: "course",
      entries,
      isComplete: true,
    }),
  );
  [missing] = await sql`
    select is_current from public.catalogue_listings
    where code = 'COMP2401' and academic_year_id = ${year.id}
  `;
  assert.equal(missing.is_current, true);
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

test("a first import creates an applied version and a repeat import is unchanged", async () => {
  const run = await startRun([CODE]);
  assert.equal(run.targets.length, 1);
  const targetId = run.targets[0].targetId;

  await processImportTarget({ runId: run.runId, targetId });

  const [target] = await sql`
    select status, change_kind, candidate_version_id, applied_version_id, error_message
    from public.catalogue_import_targets where id = ${targetId}::uuid
  `;
  assert.equal(target.error_message, null);
  assert.equal(target.status, "ready");
  assert.equal(target.change_kind, "new");
  assert.ok(target.candidate_version_id);
  assert.equal(
    Number(target.applied_version_id),
    Number(target.candidate_version_id),
  );
  assert.equal(openRouterCalls, 1);

  const [itemYear] = await sql`
    select item_years.published_version_id
    from public.catalogue_records as item_years
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = ${CODE}
  `;
  assert.equal(itemYear.published_version_id, null);

  const [details] = await sql`
    select title, units, subject_code from public.course_version_details
    where version_id = ${target.candidate_version_id}
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
    where version_id = ${target.candidate_version_id}
  `;
  assert.ok(rules >= 1, "the fixture page carries requisite rules");

  const [runRow] = await sql`
    select status, completed_count, cost_usd from public.catalogue_import_runs where id = ${run.runId}::uuid
  `;
  assert.equal(runRow.status, "completed");
  assert.equal(runRow.completed_count, 1);
  assert.equal(Number(runRow.cost_usd), 0.001);

  // A second run over identical content reuses the validated response and
  // records no new version.
  const secondRun = await startRun([CODE]);
  const { completed } = await processImportRunInline({
    runId: secondRun.runId,
  });
  assert.equal(completed, 1);
  const [second] = await sql`
    select status, change_kind, candidate_version_id from public.catalogue_import_targets
    where run_id = ${secondRun.runId}::uuid
  `;
  assert.equal(second.status, "unchanged");
  assert.equal(second.change_kind, "unchanged");
  assert.equal(second.candidate_version_id, null);
  assert.equal(
    openRouterCalls,
    1,
    "identical input does not pay for a second model call",
  );
});

test("a changed import records open changes, applies accepted ones and publishes", async () => {
  // Alter the published fixture so the next import differs in the title only.
  const [item] = await sql`
    select item_years.id as record_id, item_years.published_version_id
    from public.catalogue_records as item_years
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = ${CODE}
  `;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${ADMIN_ID}, true)`;
    await tx`select public.publish_catalogue_version(${item.record_id})`;
  });
  const [{ count: acceptedOnFirst }] = await sql`
    select count(*)::int as count from public.catalogue_import_changes as changes
    join public.catalogue_import_targets as targets on targets.id = changes.target_id
    where targets.record_id = ${item.record_id} and changes.entry_kind = 'change' and changes.status = 'accepted'
  `;
  assert.ok(
    acceptedOnFirst > 0,
    "a first import records its fields as accepted changes",
  );

  // The revised page changes the title and the introduction; the canned model
  // answer follows the page so the merge sees a consistent extraction.
  const revisedHtml = fixtureHtml
    .replaceAll("Relational Databases", "Relational Databases (revised)")
    .replace(
      "Students design, query and reason about relational databases.",
      "Students design, query, tune and reason about relational databases.",
    );
  const revisedDeterministic = extractDeterministicCourse({
    html: revisedHtml,
    courseCode: CODE,
    year: YEAR,
    sourceUrl,
  });
  const previousPage = pageRef.current;
  const previousModel = modelAnswerRef.current;
  pageRef.current = revisedHtml;
  modelAnswerRef.current = {
    ...revisedDeterministic,
    evidence: revisedDeterministic.evidence.map((item) => ({
      ...item,
      method: "model",
    })),
  };
  try {
    const run = await startRun([CODE]);
    await processImportRunInline({ runId: run.runId });
    const [target] = await sql`
      select id, status, change_kind, candidate_version_id from public.catalogue_import_targets
      where run_id = ${run.runId}::uuid
    `;
    assert.equal(target.status, "ready");
    assert.equal(target.change_kind, "changed");

    const changes = await sql`
      select id, field_path, status, old_value, new_value from public.catalogue_import_changes
      where target_id = ${target.id}::uuid and entry_kind = 'change' order by position
    `;
    const paths = changes.map((change) => change.field_path);
    assert.ok(paths.includes("course.details.title"), paths.join(","));
    assert.ok(paths.includes("course.details.introduction"), paths.join(","));
    assert.ok(changes.every((change) => change.status === "open"));

    // Publishing is blocked while changes are open.
    const [{ blockers }] = await sql`
      select public.catalogue_publish_blockers(${item.record_id}) as blockers
    `;
    assert.ok(
      blockers.some((reason) =>
        /open changes|no version|already published/.test(reason),
      ),
      blockers.join(" "),
    );

    // Accept the title, reject the description.
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${ADMIN_ID}, true)`;
      for (const change of changes) {
        await tx`
          select public.resolve_catalogue_import_change(
            ${change.id}, ${change.field_path === "course.details.introduction" ? "rejected" : "accepted"}
          )
        `;
      }
    });
    const applied = await applyImportReview({
      targetId: target.id,
      userId: ADMIN_ID,
      sql,
    });
    assert.equal(
      applied.reusedCandidate,
      false,
      "a partial acceptance builds a merged version",
    );

    const [merged] = await sql`
      select details.title, details.introduction
      from public.course_version_details as details
      where details.version_id = ${applied.versionId}
    `;
    assert.equal(merged.title, revisedDeterministic.title);
    assert.equal(
      merged.introduction,
      deterministicAnswer.introduction,
      "the rejected change keeps the baseline value",
    );

    const [pointer] = await sql`
      select published_version_id from public.catalogue_records where id = ${item.record_id}
    `;
    assert.notEqual(Number(pointer.published_version_id), applied.versionId);

    await assert.rejects(
      applyImportReview({ targetId: target.id, userId: ADMIN_ID, sql }),
      /already been applied/,
    );

    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${ADMIN_ID}, true)`;
      await tx`select public.publish_catalogue_version(${item.record_id})`;
    });
    const [published] = await sql`
      select published_version_id from public.catalogue_records where id = ${item.record_id}
    `;
    assert.equal(Number(published.published_version_id), applied.versionId);
  } finally {
    pageRef.current = previousPage;
    modelAnswerRef.current = previousModel;
  }
});

test("a run refuses a second unfinished target for the same item year", async () => {
  const run = await startRun(["COMP2401"]);
  await assert.rejects(startRun(["COMP2401"]), /unfinished import/);
  await sql`delete from public.catalogue_import_runs where id = ${run.runId}::uuid`;
});
