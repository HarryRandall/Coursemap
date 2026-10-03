import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test, vi } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { textFingerprint } from "../lib/catalogue-import/canonical.ts";
import { compactStructureAdapter } from "../lib/catalogue-import/kinds/structure/compact-adapter.ts";
import { processCatalogueSync } from "../lib/catalogue-sync/process-sync.ts";
import { restoreOpenRouterExtraction } from "../lib/catalogue-import/openrouter.ts";
import {
  publishSavedCourseRunDrafts,
  setCourseRunAutoPublish,
} from "../lib/catalogue-runs/publication.ts";
import {
  readCourseRuns,
  readCourseRunHistory,
  readCourseRunItems,
} from "../lib/catalogue-runs/service.ts";
import { reserveCourseRunSpend } from "../lib/catalogue-runs/budget.ts";
const artifacts = vi.hoisted(() => new Map());
const paid = vi.hoisted(() => ({
  calls: 0,
  responses: new Map(),
  errors: new Map(),
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", async (original) => ({
  ...(await original()),
  revalidateTag: revalidate,
}));
vi.mock("../lib/catalogue-sync/artifact-store.ts", async (original) => ({
  ...(await original()),
  storeSyncArtifact: async ({
    academicYear,
    syncId,
    stage,
    kind,
    mediaType,
    body,
  }) => {
    const contentSha256 = textFingerprint(body);
    const path = `${academicYear}/${syncId}/${stage}/${kind}/${contentSha256}`;
    artifacts.set(path, body);
    return {
      bucket: "test-only",
      path,
      mediaType,
      contentSha256,
      byteSize: Buffer.byteLength(body),
    };
  },
  readSyncArtifact: async ({ artifact }) => artifacts.get(artifact.path),
}));
vi.mock("../lib/catalogue-import/openrouter.ts", async (original) => ({
  ...(await original()),
  extractWithOpenRouter: async ({ model, modelInput, schemaName }) => {
    paid.calls++;
    const input = JSON.parse(modelInput);
    const requirements = paid.responses.get(input.code)?.requirements ?? {
      sourceText: input.requirements,
      sourceLocator: "Requirements",
      rule: null,
      unmodelledText: [input.requirements],
    };
    return restoreOpenRouterExtraction(
      {
        id: `test-${paid.calls}`,
        model,
        content: JSON.stringify({ requirements }),
        finishReason: "stop",
        latencyMilliseconds: 1,
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          totalTokens: 20,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          costUsd: 0.0005,
        },
        responseError: paid.errors.get(input.code) ?? null,
      },
      model,
      schemaName,
    );
  },
}));

const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/catalogue/anu-2026-structure-source-first.json",
      import.meta.url,
    ),
  ),
);
const finance = fixtures.find((item) => item.code === "FINM-MAJ");
const plain = finance.markdown.replace(
  /## Other Information[\s\S]*?(?=## Relevant Degrees)/u,
  "",
);
let sql;
let userId;
const runs = [];
const codeIds = [];
const inputs = new Map();
beforeAll(async () => {
  const url =
    process.env.COURSEMAP_RUN_TEST_DATABASE_URL ??
    (process.env.CI === "true" || process.env.COURSEMAP_TEST_SUPABASE_WORKDIR
      ? localTestEnvironment().COURSEMAP_DATABASE_URL
      : null);
  if (
    !url ||
    (!/test/iu.test(new URL(url).pathname) &&
      process.env.CI !== "true" &&
      !process.env.COURSEMAP_TEST_SUPABASE_WORKDIR)
  )
    throw new Error("An isolated local test database is required.");
  process.env.COURSEMAP_DATABASE_URL = url;
  process.env.OPENROUTER_API_KEY = "";
  process.env.COURSEMAP_QUEUE_SYNCS_ENABLED = "false";
  sql = await createLocalDatabaseClient({
    env: { COURSEMAP_DATABASE_URL: url },
  });
  userId = randomUUID();
  await sql`insert into auth.users (id) values (${userId}::uuid)`;
  await sql`insert into private.user_roles (user_id,role_id) select ${userId}::uuid,id from private.app_roles where key='admin' on conflict (user_id) do update set role_id=excluded.role_id`;
  const [year] =
    await sql`select id from public.academic_years where year=2026`;
  for (const kind of ["major", "minor", "specialisation"]) {
    const [run] =
      await sql`insert into public.catalogue_course_runs (kind,academic_year,requested_by,requested_model,course_limit,budget_usd,input_usd_per_million,output_usd_per_million,publish_verified) values (${kind},2026,${userId}::uuid,'google/gemini-3.1-flash-lite',4,0.5,0.25,1.5,true) returning id`;
    const entry = { kind, id: run.id, items: [] };
    runs.push(entry);
    for (let i = 0; i < 4; i++) {
      const code = `TEST${i}-${kind === "major" ? "MAJ" : kind === "minor" ? "MIN" : "SPEC"}`;
      const [identity] =
        await sql`insert into public.catalogue_codes (kind,code) values (${kind},${code}) returning id`;
      codeIds.push(identity.id);
      const [record] =
        await sql`insert into public.catalogue_records (code_id,kind,academic_year_id) values (${identity.id},${kind},${year.id}) returning id`;
      const [sync] =
        await sql`insert into public.catalogue_syncs (record_id,trigger,requested_model,parser_version,prompt_version,schema_version) values (${record.id},'manual','google/gemini-3.1-flash-lite',${compactStructureAdapter.parserVersion},${compactStructureAdapter.promptVersion},${compactStructureAdapter.schemaVersion}) returning id`;
      await sql`insert into public.catalogue_course_run_items (run_id,record_id,sync_id) values (${run.id}::uuid,${record.id},${sync.id}::uuid)`;
      entry.items.push({ recordId: record.id, syncId: sync.id, code });
      const source = plain
        .replaceAll("FINM-MAJ", code)
        .replaceAll("major", kind)
        .replaceAll("Major", kind[0].toUpperCase() + kind.slice(1));
      inputs.set(
        code,
        i === 1
          ? source + "\nConsult the convenor for alternative completion rules."
          : source,
      );
    }
  }
  vi.spyOn(compactStructureAdapter, "fetchSource").mockImplementation(
    async (claim) => {
      const html = inputs.get(claim.code);
      const url = `https://programsandcourses.anu.edu.au/2026/${claim.kind}/${claim.code}`;
      return {
        sourceUrl: url,
        canonicalUrl: url,
        html,
        contentSha256: textFingerprint(html),
        byteSize: Buffer.byteLength(html),
        httpStatus: 200,
        httpEtag: null,
        sourceLastModified: null,
        fetchedAt: "2026-10-03T00:00:00Z",
        sourceError: null,
      };
    },
  );
  vi.spyOn(compactStructureAdapter, "prepareInput").mockImplementation(
    (claim) => inputs.get(claim.code),
  );
  vi.spyOn(compactStructureAdapter, "loadPromptContext").mockResolvedValue({
    knownTags: [],
    knownStructures: auditSamples.map((item) => ({
      code: item.code,
      kind: item.kind,
      name: item.markdown.match(/^# (.+)$/m)[1],
    })),
  });
});

test("all three kinds import, publish verified lists, and retain ambiguous rules for review", async () => {
  for (const run of runs) {
    for (const item of run.items.slice(0, 2))
      await processCatalogueSync({ syncId: item.syncId, maxDeliveries: 1 });
    const summary = (await readCourseRuns(2026, { runId: run.id }))[0];
    expect(summary.kind).toBe(run.kind);
    expect(summary.imported).toBe(2);
    expect(summary.published).toBe(1);
    expect(summary.review).toBe(1);
    expect(summary.paid_courses).toBe(1);
    expect(summary.free_courses).toBe(1);
    expect(Number(summary.spent_usd)).toBeCloseTo(0.0005);
    const results = await readCourseRunItems(2026, run.id, 1, true);
    expect(results.items).toHaveLength(1);
    expect(results.items[0].title).toBe("Finance");
    const history = await readCourseRunHistory(1, { kind: run.kind });
    expect(history.runs.every((item) => item.kind === run.kind)).toBe(true);
    const calls = paid.calls;
    await processCatalogueSync({
      syncId: run.items[0].syncId,
      maxDeliveries: 1,
    });
    expect(paid.calls).toBe(calls);
  }
}, 60000);

test("saved verified structure drafts publish after stopping, while edited and uncertain drafts remain held", async () => {
  for (const run of runs) {
    await setCourseRunAutoPublish(sql, run.id, userId, false);
    for (const item of run.items.slice(2))
      await processCatalogueSync({ syncId: item.syncId, maxDeliveries: 1 });
    await sql`update public.catalogue_drafts set updated_by=${userId}::uuid where record_id=${run.items[3].recordId}`;
    await sql`update public.catalogue_course_runs set state='cancelled' where id=${run.id}::uuid`;
    const before = paid.calls;
    const result = await publishSavedCourseRunDrafts(sql, run.id, userId);
    expect(result).toMatchObject({ published: 1, held: 2, hasMore: false });
    expect(paid.calls).toBe(before);
    await expect(
      reserveCourseRunSpend(sql, run.items[3].syncId, 1000),
    ).rejects.toThrow("stopped");
  }
}, 60000);

test("structure runs enforce the larger request allowance and reject mixed-kind manifests", async () => {
  const run = runs[0];
  await sql`update public.catalogue_course_runs set state='active' where id=${run.id}::uuid`;
  await expect(
    reserveCourseRunSpend(sql, run.items[0].syncId, 40001),
  ).rejects.toThrow("input cap");
  await expect(
    sql`update public.catalogue_course_run_items set run_id=${runs[1].id}::uuid where sync_id=${run.items[0].syncId}::uuid`,
  ).rejects.toThrow("run kind");
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (!sql) return;
  if (!runs.length) {
    if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
    await sql.end();
    return;
  }
  await sql`delete from public.catalogue_course_run_items where run_id = any(${sql.array(runs.map((run) => run.id))}::uuid[])`;
  await sql`delete from public.catalogue_course_runs where id = any(${sql.array(runs.map((run) => run.id))}::uuid[])`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_drafts where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codeIds)}::bigint[]))`;
    await sql`delete from public.catalogue_publications where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codeIds)}::bigint[]))`;
    await sql`update public.catalogue_records set published_version_id = null, latest_source_version_id = null where code_id = any(${sql.array(codeIds)}::bigint[])`;
    await sql`delete from public.catalogue_change_events where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codeIds)}::bigint[]))`;
    await sql`update public.catalogue_syncs set source_version_id = null, previous_source_version_id = null, source_document_id = null where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codeIds)}::bigint[]))`;
    await sql`delete from public.catalogue_versions where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codeIds)}::bigint[]))`;
    await sql`delete from public.catalogue_codes where id = any(${sql.array(codeIds)}::bigint[])`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
    await sql`alter table public.catalogue_source_documents enable trigger catalogue_source_documents_reject_mutation`;
  }
  await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end();
});

test("course publication permission cannot enable or publish a structure run", async () => {
  const [role] =
    await sql`insert into private.app_roles (key, name, description) values (${`test_structure_${randomUUID().replaceAll("-", "_")}`}, 'Test course-only publisher', 'Isolated structure import permission test') returning id`;
  try {
    await sql`insert into private.role_permissions (role_id, permission_id) select ${role.id}, id from private.app_permissions where key in ('imports.manage', 'courses.write')`;
    await sql`update private.user_roles set role_id=${role.id} where user_id=${userId}::uuid`;
    await expect(
      setCourseRunAutoPublish(sql, runs[0].id, userId, true),
    ).rejects.toThrow("publication permission");
    await expect(
      publishSavedCourseRunDrafts(sql, runs[0].id, userId),
    ).rejects.toThrow("publication permission");
  } finally {
    await sql`update private.user_roles set role_id=(select id from private.app_roles where key='admin') where user_id=${userId}::uuid`;
    await sql`delete from private.role_permissions where role_id=${role.id}`;
    await sql`delete from private.app_roles where id=${role.id}`;
  }
});

const auditSamples = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/catalogue/anu-2026-structure-audit.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

async function auditRun(kind, samples) {
  const [run] =
    await sql`insert into public.catalogue_course_runs (kind,academic_year,requested_by,requested_model,course_limit,budget_usd,input_usd_per_million,output_usd_per_million,publish_verified) values (${kind},2026,${userId}::uuid,'google/gemini-3.1-flash-lite',${samples.length},0.5,0.25,1.5,true) returning id`;
  const entry = { id: run.id, kind, items: [] };
  runs.push(entry);
  const [year] =
    await sql`select id from public.academic_years where year=2026`;
  for (const sample of samples) {
    const code = `AUDIT${codeIds.length}-${kind === "major" ? "MAJ" : kind === "minor" ? "MIN" : "SPEC"}`;
    const [identity] =
      await sql`insert into public.catalogue_codes (kind,code) values (${kind},${code}) returning id`;
    codeIds.push(identity.id);
    const [record] =
      await sql`insert into public.catalogue_records (code_id,kind,academic_year_id) values (${identity.id},${kind},${year.id}) returning id`;
    const [sync] =
      await sql`insert into public.catalogue_syncs (record_id,trigger,requested_model,parser_version,prompt_version,schema_version) values (${record.id},'manual','google/gemini-3.1-flash-lite',${compactStructureAdapter.parserVersion},${compactStructureAdapter.promptVersion},${compactStructureAdapter.schemaVersion}) returning id`;
    await sql`insert into public.catalogue_course_run_items (run_id,record_id,sync_id) values (${run.id}::uuid,${record.id},${sync.id}::uuid)`;
    inputs.set(code, sample.markdown);
    paid.responses.set(code, sample.model);
    entry.items.push({
      code,
      originalCode: sample.code,
      recordId: record.id,
      syncId: sync.id,
    });
  }
  return entry;
}

test("all captured audit sources persist without the eight live validation crashes", async () => {
  for (const kind of ["major", "minor", "specialisation"]) {
    const run = await auditRun(
      kind,
      auditSamples.filter((item) => item.kind === kind),
    );
    for (const item of run.items) {
      await processCatalogueSync({ syncId: item.syncId, maxDeliveries: 1 });
      const [status] =
        await sql`select status,error_message from public.catalogue_syncs where id=${item.syncId}::uuid`;
      expect(
        status.status,
        `${item.originalCode}: ${status.error_message}`,
      ).toBe("applied");
    }
    // Check the published rows, not only the run counters: source policies,
    // compulsory counts and course choices must survive the write boundary.
    for (const item of run.items) {
      const [record] =
        await sql`select published_version_id from public.catalogue_records where id=${item.recordId}`;
      if (!record.published_version_id) continue;
      const sample = auditSamples.find(
        (entry) => entry.code === item.originalCode,
      );
      const result = compactStructureAdapter.finalise({
        claim: { kind, code: item.code, academicYear: 2026 },
        listingTitle: null,
        pageMarkdown: sample.markdown,
        model: null,
        responseError: null,
        finishReason: "stop",
        context: {
          knownTags: [],
          knownStructures: auditSamples.map((entry) => ({
            code: entry.code,
            kind: entry.kind,
            name: entry.markdown.match(/^# (.+)$/m)[1],
          })),
        },
      });
      const expected = compactStructureAdapter.project(result.extraction);
      const versionId = record.published_version_id;
      const [details] =
        await sql`select name,units,introduction from public.structure_version_details where version_id=${versionId}`;
      expect(
        { ...details, units: Number(details.units) },
        item.originalCode,
      ).toEqual({
        name: expected.structure.details.name,
        units: expected.structure.details.units,
        introduction: expected.structure.details.introduction,
      });
      const sections =
        await sql`select section_key,markdown from public.academic_structure_snapshot_sections where version_id=${versionId} order by position`;
      expect([...sections], item.originalCode).toEqual(
        expected.structure.sections.map((section) => ({
          section_key: section.sectionKey,
          markdown: section.markdown,
        })),
      );
      const conditions =
        await sql`select condition_key,condition_kind,minimum_units,maximum_units,minimum_count,subject_code,minimum_level,maximum_level,source_text from public.requirement_conditions where version_id=${versionId} order by condition_key`;
      const nullableNumber = (value) => (value === null ? null : Number(value));
      expect(
        conditions.map((condition) => ({
          ...condition,
          minimum_units: nullableNumber(condition.minimum_units),
          maximum_units: nullableNumber(condition.maximum_units),
        })),
        item.originalCode,
      ).toEqual(
        expected.requirements.conditions
          .map((condition) => ({
            condition_key: condition.key,
            condition_kind: condition.kind,
            minimum_units: condition.minimumUnits,
            maximum_units: condition.maximumUnits,
            minimum_count: condition.minimumCount,
            subject_code: condition.subjectCode,
            minimum_level: condition.minimumLevel,
            maximum_level: condition.maximumLevel,
            source_text: condition.sourceText,
          }))
          .sort((a, b) => a.condition_key.localeCompare(b.condition_key)),
      );
      const options =
        await sql`select c.condition_key,o.code from public.requirement_condition_options o join public.requirement_conditions c on c.id=o.condition_id where o.version_id=${versionId} order by c.condition_key,o.code`;
      expect([...options], item.originalCode).toEqual(
        expected.requirements.options
          .map((option) => ({
            condition_key: option.conditionKey,
            code: option.code,
          }))
          .sort(
            (a, b) =>
              a.condition_key.localeCompare(b.condition_key) ||
              a.code.localeCompare(b.code),
          ),
      );
    }
    for (const item of run.items.filter((entry) =>
      ["BIOL-MIN", "ADPH-SPEC"].includes(entry.originalCode),
    )) {
      const groups =
        await sql`select g.minimum_units, g.maximum_units from public.requirement_groups g join public.catalogue_records r on r.published_version_id=g.version_id where r.id=${item.recordId} order by g.parent_group_id nulls first, g.position`;
      expect(
        groups.map((group) => [
          group.minimum_units === null ? null : Number(group.minimum_units),
          Number(group.maximum_units),
        ]),
      ).toEqual([
        [24, 24],
        [null, 12],
        [12, 24],
      ]);
    }
    const summary = (await readCourseRuns(2026, { runId: run.id }))[0];
    expect(summary.imported).toBe(run.items.length);
    expect(summary.failed).toBe(0);
    expect(summary.published).toBe(
      { major: 14, minor: 15, specialisation: 20 }[kind],
    );
    expect(summary.published + summary.review).toBe(run.items.length);
    console.log(
      "AUDIT_REPLAY",
      JSON.stringify({
        kind,
        imported: summary.imported,
        published: summary.published,
        held: summary.review,
      }),
    );
  }
}, 180000);

test("accepted provider errors preserve the response but create no successful import", async () => {
  const sample = auditSamples.find((item) => item.code === "ANTH-HSPC");
  const run = await auditRun("specialisation", [sample]);
  const item = run.items[0];
  paid.errors.set(item.code, "Provider rate limit (429).");
  await processCatalogueSync({ syncId: item.syncId, maxDeliveries: 1 });
  const summary = (await readCourseRuns(2026, { runId: run.id }))[0];
  expect(summary.failed).toBe(1);
  expect(summary.imported).toBe(0);
  expect(summary.published).toBe(0);
  expect(summary.review).toBe(0);
  const [stored] =
    await sql`select response_artifact_id from public.catalogue_extractions where sync_id=${item.syncId}::uuid`;
  expect(stored.response_artifact_id).not.toBeNull();
  const [draft] =
    await sql`select record_id from public.catalogue_drafts where record_id=${item.recordId}`;
  expect(draft).toBeUndefined();
});

test("provider-paused entries are not finished imports or ready drafts", async () => {
  const run = await auditRun(
    "minor",
    auditSamples.filter((item) => item.kind === "minor").slice(0, 2),
  );
  await sql`update public.catalogue_syncs set status='paused',error_message='Provider spending limit reached.' where id = any(${sql.array(run.items.map((item) => item.syncId))}::uuid[])`;
  const summary = (await readCourseRuns(2026, { runId: run.id }))[0];
  expect(summary).toMatchObject({
    state: "paused",
    finished: 0,
    imported: 0,
    review: 0,
    drafts: 0,
    pause_reason: "Provider spending limit reached.",
  });
  const paused = await readCourseRunHistory(1, {
    kind: "minor",
    status: "paused",
  });
  expect(paused.runs.some((item) => item.id === run.id)).toBe(true);
  const complete = await readCourseRunHistory(1, {
    kind: "minor",
    status: "finished",
  });
  expect(complete.runs.some((item) => item.id === run.id)).toBe(false);
});

test("the review tab does not include an older draft while its request is paused", async () => {
  const run = runs[0];
  const item = run.items[1];
  await sql`update public.catalogue_syncs set status='paused' where id=${item.syncId}::uuid`;
  try {
    const [summary] = await readCourseRuns(2026, { runId: run.id });
    expect(summary.review).toBe(0);
    expect(summary.publication_blockers).toEqual([]);
    const review = await readCourseRunItems(2026, run.id, 1, true);
    expect(
      review.items.some((row) => row.recordId === Number(item.recordId)),
    ).toBe(false);
    const pending = await readCourseRunItems(2026, run.id, 1, false, {
      outcome: "pending",
    });
    expect(
      pending.items.some((row) => row.recordId === Number(item.recordId)),
    ).toBe(true);
  } finally {
    await sql`update public.catalogue_syncs set status='applied' where id=${item.syncId}::uuid`;
  }
});
