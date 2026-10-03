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
const paid = vi.hoisted(() => ({ calls: 0 }));
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
    const requirements = {
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
        responseError: null,
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
  const url = process.env.COURSEMAP_RUN_TEST_DATABASE_URL;
  if (!url || !/test/iu.test(new URL(url).pathname))
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
