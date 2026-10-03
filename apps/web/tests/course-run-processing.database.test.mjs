import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test, vi } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { textFingerprint } from "../lib/catalogue-import/canonical.ts";
import { compactCourseAdapter } from "../lib/catalogue-import/kinds/course/compact-adapter.ts";
import { parsePlainCourseRequisites } from "../lib/catalogue-import/kinds/course/plain-requisites.ts";
import { publishCatalogueDraft } from "../lib/catalogue/drafts.ts";
import { sourceFirstPublicationEligible } from "../lib/catalogue-runs/eligibility.ts";
import {
  publishVerifiedRunCandidate,
  publishSavedCourseRunDrafts,
  setCourseRunAutoPublish,
} from "../lib/catalogue-runs/publication.ts";
import { repairCourseRunOfferings } from "../lib/catalogue-runs/repair-offerings.ts";
import { persistSourceVersion } from "../lib/catalogue-sync/persist-source-version.ts";
import {
  claimCatalogueSync,
  finishCatalogueSync,
  startSyncStage,
  recordSyncArtifact,
} from "../lib/catalogue-sync/sync-store.ts";
import { storeSyncArtifact } from "../lib/catalogue-sync/artifact-store.ts";
import {
  readCourseRuns,
  readCourseRunHistory,
  readCourseRunItems,
} from "../lib/catalogue-runs/service.ts";
import { processCatalogueSync } from "../lib/catalogue-sync/process-sync.ts";
import { restoreOpenRouterExtraction } from "../lib/catalogue-import/openrouter.ts";

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
    const requisites = {
      ...parsePlainCourseRequisites(null),
      prerequisiteText: input.requisiteText,
      unmodelledText: [input.requisiteText],
    };
    return restoreOpenRouterExtraction(
      {
        id: `test-${paid.calls}`,
        model,
        content: JSON.stringify({ requisites }),
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

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/course-import/anu-2026-source-first.json",
      import.meta.url,
    ),
  ),
);
let sql;
let runId;
let userId;
const codes = [];
const inputs = new Map();
const syncIds = [];

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
    throw new Error(
      "Set COURSEMAP_RUN_TEST_DATABASE_URL to an isolated local test database; never use the preview database.",
    );
  process.env.COURSEMAP_DATABASE_URL = url;
  process.env.OPENROUTER_API_KEY = "";
  process.env.COURSEMAP_QUEUE_SYNCS_ENABLED = "false";
  sql = await createLocalDatabaseClient({
    env: { COURSEMAP_DATABASE_URL: url },
  });
  userId = randomUUID();
  await sql`insert into auth.users (id) values (${userId}::uuid)`;
  await sql`insert into private.user_roles (user_id, role_id) select ${userId}::uuid, id from private.app_roles where key = 'admin' on conflict (user_id) do update set role_id = excluded.role_id`;
  const [year] =
    await sql`select id from public.academic_years where year = 2026`;
  const [run] =
    await sql`insert into public.catalogue_course_runs (academic_year, requested_by, requested_model, course_limit, budget_usd, input_usd_per_million, output_usd_per_million) values (2026, ${userId}::uuid, 'google/gemini-3.1-flash-lite', 100, 0.5, 0.25, 1.5) returning id`;
  runId = run.id;
  for (let i = 0; i < 100; i++) {
    const code = `BCHK${1000 + i}`;
    const original =
      fixture.sources[(i === 3 ? 2 : i) % fixture.sources.length];
    const markdown = original.markdown.replaceAll(original.code, code);
    const plainLayout = markdown
      .split(/^## /mu)
      .filter((block) => !/^(?:Other Information|Minors)\n/u.test(block))
      .join("## ");
    inputs.set(
      code,
      i === 2 || i === 3
        ? plainLayout.replace(
            "Student Contribution Band:** [34]",
            "Student Contribution Band:** [4]",
          )
        : i === 10
          ? markdown.replace(
              /Student Contribution Band:\*\* \[\d+\]/u,
              "Student Contribution Band:** [99]",
            )
          : markdown,
    );
    const [identity] =
      await sql`insert into public.catalogue_codes (kind, code) values ('course', ${code}) returning id`;
    codes.push(identity.id);
    const [record] =
      await sql`insert into public.catalogue_records (code_id, kind, academic_year_id) values (${identity.id}, 'course', ${year.id}) returning id`;
    const [sync] =
      await sql`insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version) values (${record.id}, 'manual', 'google/gemini-3.1-flash-lite', ${compactCourseAdapter.parserVersion}, ${compactCourseAdapter.promptVersion}, ${compactCourseAdapter.schemaVersion}) returning id`;
    await sql`insert into public.catalogue_course_run_items (run_id, record_id, sync_id) values (${runId}::uuid, ${record.id}, ${sync.id}::uuid)`;
    syncIds.push(sync.id);
  }
  vi.spyOn(compactCourseAdapter, "fetchSource").mockImplementation(
    async (claim) => {
      const html = inputs.get(claim.code);
      return {
        sourceUrl: `https://programsandcourses.anu.edu.au/2026/course/${claim.code}`,
        canonicalUrl: `https://programsandcourses.anu.edu.au/2026/course/${claim.code}`,
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
  vi.spyOn(compactCourseAdapter, "prepareInput").mockImplementation((claim) =>
    inputs.get(claim.code),
  );
  vi.spyOn(compactCourseAdapter, "loadPromptContext").mockResolvedValue(
    fixture.context,
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (!sql) return;
  if (!runId) {
    if (userId) await sql`delete from auth.users where id = ${userId}::uuid`;
    await sql.end();
    return;
  }
  await sql`delete from public.catalogue_course_run_items where run_id = ${runId}::uuid`;
  await sql`delete from public.catalogue_course_runs where id = ${runId}::uuid`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_drafts where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codes)}::bigint[]))`;
    await sql`delete from public.catalogue_publications where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codes)}::bigint[]))`;
    await sql`update public.catalogue_records set published_version_id = null, latest_source_version_id = null where code_id = any(${sql.array(codes)}::bigint[])`;
    await sql`delete from public.catalogue_change_events where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codes)}::bigint[]))`;
    await sql`update public.catalogue_syncs set source_version_id = null, previous_source_version_id = null, source_document_id = null where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codes)}::bigint[]))`;
    await sql`delete from public.catalogue_versions where record_id in (select id from public.catalogue_records where code_id = any(${sql.array(codes)}::bigint[]))`;
    await sql`delete from public.catalogue_codes where id = any(${sql.array(codes)}::bigint[])`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
    await sql`alter table public.catalogue_source_documents enable trigger catalogue_source_documents_reject_mutation`;
  }
  await sql`delete from auth.users where id = ${userId}::uuid`;
  await sql.end();
});

test("a capped 100-course run persists independent source versions and drafts with bounded spending", async () => {
  for (const syncId of syncIds)
    await processCatalogueSync({ syncId, maxDeliveries: 1 });
  const rows =
    await sql`select syncs.status, syncs.error_message, syncs.source_version_id, records.published_version_id from public.catalogue_course_run_items items join public.catalogue_syncs syncs on syncs.id = items.sync_id join public.catalogue_records records on records.id = items.record_id where items.run_id = ${runId}::uuid`;
  expect(
    rows
      .filter((row) => row.status === "failed")
      .map((row) => row.error_message),
  ).toEqual([]);
  expect(rows).toHaveLength(100);
  expect(rows.every((row) => row.source_version_id !== null)).toBe(true);
  expect(rows.every((row) => row.published_version_id === null)).toBe(true);
  expect(paid.calls).toBeGreaterThan(0);
  expect(paid.calls).toBeLessThan(100);
  const [spent] =
    await sql`select sum(actual_usd) as amount from public.catalogue_course_run_items where run_id = ${runId}::uuid`;
  expect(Number(spent.amount)).toBeCloseTo(paid.calls * 0.0005, 8);
  const summary = (await readCourseRuns(2026)).find((run) => run.id === runId);
  expect(summary.paid_courses).toBe(paid.calls);
  expect(summary.free_courses).toBe(100 - paid.calls);
  expect(Number(summary.spent_usd)).toBeCloseTo(Number(spent.amount), 8);
  expect(Number(summary.reserved_usd)).toBe(0);
  expect(summary.drafts).toBeGreaterThan(0);
  expect(summary.review).toBeLessThan(100);
  expect(summary.drafts + summary.review).toBe(100);
  const saved = await readCourseRuns(undefined, { runId: String(runId) });
  expect(saved.map((run) => run.id)).toEqual([String(runId)]);
  expect(saved[0].academic_year).toBe(2026);
  const history = await readCourseRunHistory(1);
  expect(history.total).toBeGreaterThan(0);
  expect(history.runs.length).toBeLessThanOrEqual(25);
  expect(saved[0].started_at).not.toBeNull();
  expect(saved[0].completed_at).not.toBeNull();
  const firstPage = await readCourseRunItems(2026, String(runId), 1);
  const pageTwo = await readCourseRunItems(2026, String(runId), 2);
  expect(firstPage.total).toBe(100);
  expect(firstPage.pageSize).toBe(25);
  const stalePage = await readCourseRunItems(2026, String(runId), 99);
  expect(stalePage.page).toBe(4);
  expect(stalePage.total).toBe(100);
  expect(stalePage.items).toHaveLength(25);
  expect(firstPage.items).toHaveLength(25);
  expect(pageTwo.items).toHaveLength(25);
  expect(
    new Set([...firstPage.items, ...pageTwo.items].map((item) => item.recordId))
      .size,
  ).toBe(50);
  const reviewPage = await readCourseRunItems(2026, String(runId), 1, true);
  expect(reviewPage.total).toBe(summary.review);
  expect(reviewPage.items.length).toBeGreaterThan(0);
  expect(
    reviewPage.items.every(
      (item) => !item.published && item.hasDraft && item.issues.length > 0,
    ),
  ).toBe(true);
  const results = await readCourseRunItems(2026, String(runId), 1);
  expect(results.items).toHaveLength(25);
  expect(results.total).toBe(100);

  const selectedCode = results.items[0].code;
  const searched = await readCourseRunItems(2026, String(runId), 1, false, {
    query: selectedCode,
  });
  expect(searched.total).toBe(1);
  expect(searched.items.map((item) => item.code)).toEqual([selectedCode]);
  const filteredHistory = await readCourseRunHistory(1, {
    query: selectedCode,
    year: 2026,
    status: "finished",
  });
  expect(filteredHistory.runs.map((run) => run.id)).toContain(String(runId));
  const missingHistory = await readCourseRunHistory(1, {
    query: "NO-SUCH-COURSE",
  });
  expect(missingHistory.total).toBe(0);
  expect(missingHistory.runs).toEqual([]);
  const byIssue = await readCourseRunItems(2026, String(runId), 1, false, {
    outcome: "review",
    issue: reviewPage.items[0].issues[0],
  });
  expect(byIssue.items.length).toBeGreaterThan(0);
  expect(
    byIssue.items.every(
      (item) =>
        !item.published && item.issues.includes(reviewPage.items[0].issues[0]),
    ),
  ).toBe(true);
  const cleanDrafts = await readCourseRunItems(2026, String(runId), 1, false, {
    outcome: "draft",
  });
  expect(cleanDrafts.total).toBe(summary.drafts);
  expect(
    cleanDrafts.items.every(
      (item) => !item.published && item.hasDraft && !item.issues.length,
    ),
  ).toBe(true);
  expect(results.items[0].recordId).toBeGreaterThan(0);
  expect(
    results.items.every((item) => item.actualUsd !== null && item.hasDraft),
  ).toBe(true);
  const secondPage = await readCourseRunItems(2026, String(runId), 2);
  expect(secondPage.items).toHaveLength(25);
  expect(
    secondPage.items.some(
      (item) => item.recordId === results.items[0].recordId,
    ),
  ).toBe(false);
  expect((await readCourseRunItems(2025, String(runId), 1)).items).toEqual([]);
  expect(Number(spent.amount)).toBeLessThan(0.5);
  const [drafts] =
    await sql`select count(*) as count from public.catalogue_drafts where record_id in (select record_id from public.catalogue_course_run_items where run_id = ${runId}::uuid)`;
  expect(Number(drafts.count)).toBe(100);
  // Replaying a terminal delivery must neither pay again nor create another version.
  const before = paid.calls;
  await processCatalogueSync({ syncId: syncIds[0], maxDeliveries: 1 });
  expect(paid.calls).toBe(before);
}, 120000);

test("only a verified untouched run candidate publishes, with a separate run actor", async () => {
  await sql`update public.catalogue_course_runs set publish_verified = true where id = ${runId}::uuid`;
  const [candidate] =
    await sql`select drafts.*, syncs.id as sync_id from public.catalogue_drafts drafts join public.catalogue_syncs syncs on syncs.record_id = drafts.record_id where syncs.id = ${syncIds[2]}::uuid`;
  expect(candidate.content.flags).toEqual([]);
  expect(sourceFirstPublicationEligible(candidate.content)).toBe(true);
  const result = await publishVerifiedRunCandidate(
    sql,
    String(candidate.sync_id),
    candidate.content,
  );
  expect(result).toBeDefined();
  expect(revalidate).toHaveBeenCalled();
  const [item] =
    await sql`select published_version_id from public.catalogue_course_run_items where sync_id = ${syncIds[2]}::uuid`;
  expect(Number(item.published_version_id)).toBe(result.versionId);
  const [event] =
    await sql`select origin, editing_session_id from public.catalogue_change_events where record_id = ${candidate.record_id} and event_kind = 'publish'`;
  expect(event.origin).toBe("source");
  expect(event.editing_session_id).toBeNull();
  const [version] =
    await sql`select sealed_at from public.catalogue_versions where id = ${result.versionId}`;
  expect(version.sealed_at).not.toBeNull();
  const drafts =
    await sql`select record_id from public.catalogue_drafts where record_id = ${candidate.record_id}`;
  expect(drafts).toHaveLength(0);
});

test("uncertain optional values hold the whole candidate without changing its draft", async () => {
  const [candidate] =
    await sql`select drafts.*, syncs.id as sync_id from public.catalogue_drafts drafts join public.catalogue_syncs syncs on syncs.record_id = drafts.record_id where syncs.id = ${syncIds[10]}::uuid`;
  expect(
    candidate.content.flags.some(
      (flag) => flag.fieldPath === "fees.studentContributionBand",
    ),
  ).toBe(true);
  const result = await publishVerifiedRunCandidate(
    sql,
    String(candidate.sync_id),
    candidate.content,
  );
  expect(result).toBeUndefined();
  const [preserved] =
    await sql`select content, revision from public.catalogue_drafts where record_id = ${candidate.record_id}`;
  expect(preserved.content).toEqual(candidate.content);
  expect(preserved.revision).toBe(candidate.revision);
  const [record] =
    await sql`select published_version_id from public.catalogue_records where id = ${candidate.record_id}`;
  expect(record.published_version_id).toBeNull();
});

test("manual edits and uncertain rules block automatic publication", async () => {
  const [manual] =
    await sql`select drafts.* from public.catalogue_drafts drafts join public.catalogue_syncs syncs on syncs.record_id = drafts.record_id where syncs.id = ${syncIds[3]}::uuid`;
  await sql`update public.catalogue_drafts set updated_by = ${userId}::uuid where record_id = ${manual.record_id}`;
  await expect(
    publishCatalogueDraft({
      recordId: Number(manual.record_id),
      expectedRevision: Number(manual.revision),
      userId,
      importRunId: runId,
      sql,
    }),
  ).rejects.toThrow("untouched");
  const [uncertain] =
    await sql`select drafts.* from public.catalogue_drafts drafts join public.catalogue_syncs syncs on syncs.record_id = drafts.record_id where syncs.id = ${syncIds[4]}::uuid`;
  await expect(
    publishCatalogueDraft({
      recordId: Number(uncertain.record_id),
      expectedRevision: Number(uncertain.revision),
      userId,
      importRunId: runId,
      sql,
    }),
  ).rejects.toThrow("verification gate");
});

test("repairs saved semester data without paying again or changing edited drafts", async () => {
  const [original] =
    await sql`select * from public.catalogue_syncs where id = ${syncIds[0]}::uuid`;
  const [validated] =
    await sql`select storage_path from public.catalogue_sync_artifacts where sync_id = ${original.id}::uuid and kind = 'validated_json'`;
  const extraction = JSON.parse(artifacts.get(validated.storage_path));
  extraction.offerings = [];
  extraction.offeringStatus = "unknown";
  extraction.reviewItems.push({
    fieldKey: "offerings",
    kind: "unsupported",
    severity: "error",
    message: "The period 'First Semester' has no matching calendar identity.",
  });
  extraction.evidence = extraction.evidence.filter(
    (item) => item.fieldKey !== "offerings",
  );
  await sql`delete from public.catalogue_drafts where record_id = ${original.record_id}`;
  const [bad] =
    await sql`insert into public.catalogue_syncs (record_id, trigger, requested_model, parser_version, prompt_version, schema_version, requested_by) values (${original.record_id}, 'manual', ${original.requested_model}, ${original.parser_version}, ${original.prompt_version}, ${original.schema_version}, ${userId}::uuid) returning id`;
  const workerId = randomUUID();
  const claim = await claimCatalogueSync(sql, { syncId: bad.id, workerId });
  const result = await persistSourceVersion(sql, {
    claim,
    sourceDocumentId: original.source_document_id,
    write: compactCourseAdapter.project(extraction),
  });
  await finishCatalogueSync(sql, {
    syncId: bad.id,
    workerId,
    expectedLockVersion: claim.lockVersion,
    status: result.status,
    sourceDocumentId: original.source_document_id,
    sourceVersionId: result.sourceVersionId,
  });
  await sql`update public.catalogue_course_run_items set sync_id = ${bad.id}::uuid where sync_id = ${original.id}::uuid`;
  for (const [kind, body, mediaType] of [
    ["normalised_markdown", inputs.get(claim.code), "text/markdown"],
    ["validated_json", JSON.stringify(extraction), "application/json"],
  ]) {
    const stageId = await startSyncStage(sql, {
      syncId: bad.id,
      stageName: "domain_validate",
      attemptNumber: 1,
    });
    const stored = await storeSyncArtifact({
      academicYear: 2026,
      syncId: bad.id,
      stage: "domain_validate",
      kind,
      mediaType,
      body,
    });
    await recordSyncArtifact(sql, {
      syncId: bad.id,
      stageId,
      kind,
      attemptNumber: 1,
      mediaType,
      contentSha256: stored.contentSha256,
      byteSize: stored.byteSize,
      storageBucket: stored.bucket,
      storagePath: stored.path,
    });
  }
  const [manualBefore] =
    await sql`select content_hash, revision from public.catalogue_drafts where record_id = (select record_id from public.catalogue_syncs where id = ${syncIds[3]}::uuid)`;
  const calls = paid.calls;
  const repaired = await repairCourseRunOfferings(
    sql,
    runId,
    async (artifact) => artifacts.get(artifact.path),
  );
  expect(repaired.repaired).toContain(claim.code);
  expect(paid.calls).toBe(calls);
  const [draft] =
    await sql`select content from public.catalogue_drafts where record_id = ${original.record_id}`;
  expect(draft.content.course.sessions.length).toBeGreaterThan(0);
  expect(
    draft.content.flags.some((flag) => flag.fieldPath === "offerings"),
  ).toBe(false);
  const [manualAfter] =
    await sql`select content_hash, revision from public.catalogue_drafts where record_id = (select record_id from public.catalogue_syncs where id = ${syncIds[3]}::uuid)`;
  expect(manualAfter).toEqual(manualBefore);
  expect(
    (
      await repairCourseRunOfferings(sql, runId, async (artifact) =>
        artifacts.get(artifact.path),
      )
    ).repaired,
  ).toEqual([]);
});

test("saved verified drafts publish after stopping without enabling imports or paying again", async () => {
  await expect(
    setCourseRunAutoPublish(sql, runId, randomUUID(), true),
  ).rejects.toThrow("initiator");
  await setCourseRunAutoPublish(sql, runId, userId, false);
  await setCourseRunAutoPublish(sql, runId, userId, true);
  await sql`update public.catalogue_course_runs set state = 'cancelled', publish_verified = false where id = ${runId}::uuid`;
  const calls = paid.calls;
  const [manualBefore] =
    await sql`select content_hash, revision from public.catalogue_drafts where record_id = (select record_id from public.catalogue_syncs where id = ${syncIds[3]}::uuid)`;
  await expect(
    publishSavedCourseRunDrafts(sql, runId, randomUUID()),
  ).rejects.toThrow("permission");
  let cursor = 0;
  let published = 0;
  let held = 0;
  for (;;) {
    const batch = await publishSavedCourseRunDrafts(sql, runId, userId, cursor);
    published += batch.published;
    held += batch.held;
    if (!batch.hasMore) break;
    expect(batch.afterRecordId).toBeGreaterThan(cursor);
    cursor = batch.afterRecordId;
  }
  expect(published).toBeGreaterThan(0);
  expect(held).toBeGreaterThan(0);
  expect(paid.calls).toBe(calls);
  const [manualAfter] =
    await sql`select content_hash, revision from public.catalogue_drafts where record_id = (select record_id from public.catalogue_syncs where id = ${syncIds[3]}::uuid)`;
  expect(manualAfter).toEqual(manualBefore);
  const [run] =
    await sql`select state, publish_verified from public.catalogue_course_runs where id = ${runId}::uuid`;
  expect(run).toEqual({ state: "cancelled", publish_verified: false });
  expect(
    (await publishSavedCourseRunDrafts(sql, runId, userId)).published,
  ).toBe(0);
}, 120000);
