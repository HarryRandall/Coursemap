import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import {
  emptyCatalogueContent,
  courseCatalogueContent,
  CATALOGUE_CONTENT_SCHEMA_VERSION,
} from "../lib/catalogue/content.ts";
import {
  contentHashForCatalogueContent,
  readVersionContent,
} from "../lib/catalogue-import/version-content.ts";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
import { CBE_LIST_ONE_2024_URL } from "../lib/catalogue-import/kinds/structure/cbe-list-one.ts";
import { loadKnownCourseIdentities } from "../lib/catalogue-import/kinds/course/courses.ts";
import { loadKnownAcademicPeriods } from "../lib/catalogue-import/kinds/course/periods.ts";
import {
  readProjectionPrerequisiteRule,
  readProjectionIncompatibilityRule,
} from "../lib/coursemap/published-courses.ts";
import { loadKnownCourseTags } from "../lib/catalogue-import/kinds/course/tags.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { persistSourceVersion } from "../lib/catalogue-sync/persist-source-version.ts";
import {
  ensureAnuSourceId,
  startSyncStage,
  recordSyncArtifact,
  reserveExtraction,
  attachExtractionResponse,
  recordExtractionRequestFailure,
} from "../lib/catalogue-sync/sync-store.ts";
import { extractionUsageForStorage } from "../lib/catalogue-sync/extraction-usage.ts";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";

const YEAR = 2026;
const EMPTY_CODE = "TSTC9101";
const MANUAL_CODE = "TSTC9102";
const COHORT_CODE = "TSTC9103";
const OFFERING_CODE = "TSTC9104";
const EVIDENCE_CODE = "TSTC9105";

let sql;
let yearId;
let sourceId;
const records = new Map();

function sourceContent(code, title, description) {
  const content = emptyCatalogueContent({
    kind: "course",
    code,
    academicYear: YEAR,
    title,
  });
  content.course.details.description = description;
  content.contentHash = contentHashForCatalogueContent(content);
  return content;
}

async function removeFixtures() {
  await sql`delete from public.catalogue_listings where code in (${EMPTY_CODE}, ${MANUAL_CODE}, ${COHORT_CODE}, ${OFFERING_CODE}, ${EVIDENCE_CODE})`;
  await sql`alter table public.catalogue_source_documents disable trigger catalogue_source_documents_reject_mutation`;
  await sql`alter table public.catalogue_versions disable trigger catalogue_versions_enforce_immutability`;
  try {
    await sql`delete from public.catalogue_codes where kind = 'course' and code in (${EMPTY_CODE}, ${MANUAL_CODE}, ${COHORT_CODE}, ${OFFERING_CODE}, ${EVIDENCE_CODE})`;
  } finally {
    await sql`alter table public.catalogue_versions enable trigger catalogue_versions_enforce_immutability`;
    await sql`alter table public.catalogue_source_documents enable trigger catalogue_source_documents_reject_mutation`;
  }
}

async function createRecord(code, title) {
  const [identity] = await sql`
    insert into public.catalogue_codes (kind, code)
    values ('course', ${code}) returning id
  `;
  const [record] = await sql`
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    values (${identity.id}, 'course', ${yearId}) returning id
  `;
  await sql`
    insert into public.catalogue_listings (
      academic_year_id, kind, code, title, code_id, record_id, is_current,
      first_seen_at, last_seen_at
    ) values (
      ${yearId}, 'course', ${code}, ${title}, ${identity.id}, ${record.id},
      true, now(), now()
    )
  `;
  records.set(code, Number(record.id));
  return Number(record.id);
}

async function createSyncFixture(code, contentHash) {
  const recordId = records.get(code);
  const [record] = await sql`
    select latest_source_version_id from public.catalogue_records where id = ${recordId}
  `;
  const [sync] = await sql`
    insert into public.catalogue_syncs (
      record_id, trigger, status, requested_model, parser_version,
      prompt_version, schema_version, previous_source_version_id
    ) values (
      ${recordId}, 'manual', 'running',
      (select id from public.import_models where enabled order by id limit 1),
      'test-parser', 'test-prompt', 'test-schema', ${record.latest_source_version_id}
    ) returning id
  `;
  const [insertedDocument] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key,
      canonical_url, content_sha256, http_status, fetched_at
    ) values (
      ${sourceId}, ${recordId}, ${yearId}, 'course', ${code},
      ${`https://programsandcourses.anu.edu.au/course/${code}`},
      ${contentHash}, 200, now()
    ) on conflict (source_id, record_id, content_sha256) do nothing
    returning id
  `;
  const [document] = insertedDocument
    ? [insertedDocument]
    : await sql`
        select id from public.catalogue_source_documents
        where source_id = ${sourceId} and record_id = ${recordId}
          and content_sha256 = ${contentHash}
      `;
  return {
    documentId: Number(document.id),
    claim: {
      syncId: sync.id,
      kind: "course",
      code,
      academicYear: YEAR,
      academicYearId: Number(yearId),
      recordId,
      previousSourceVersionId:
        record.latest_source_version_id === null
          ? null
          : Number(record.latest_source_version_id),
      requestedModel: "test",
      parserVersion: "test-parser",
      promptVersion: "test-prompt",
      schemaVersion: "test-schema",
      sourceId: Number(sourceId),
      attemptCount: 1,
      lockVersion: 1,
    },
  };
}

beforeAll(async () => {
  Object.assign(process.env, localTestEnvironment(), {
    NODE_ENV: "development",
  });
  sql = await createLocalDatabaseClient();
  await removeFixtures();
  [{ id: yearId }] = await sql`
    select id from public.academic_years where year = ${YEAR}
  `;
  sourceId = await ensureAnuSourceId(sql);
  await createRecord(EMPTY_CODE, "Empty Source Record");
  await createRecord(MANUAL_CODE, "Manual Source Record");
  await createRecord(COHORT_CODE, "Cohort Exception Record");
  await createRecord(OFFERING_CODE, "Offering Roundtrip Record");
  await createRecord(EVIDENCE_CODE, "Supporting Evidence Record");
});

afterAll(async () => {
  if (!sql) return;
  await removeFixtures();
  await sql.end({ timeout: 5 });
});

test("source evidence can point to a separately recorded supporting document", async () => {
  const content = sourceContent(
    EVIDENCE_CODE,
    "Supporting Evidence Record",
    "A requirement with two sources.",
  );
  content.evidence = [
    {
      fieldPath: "description",
      method: "model",
      confidence: 1,
      sourceLocator: "ANU course page",
      sourceExcerpt: "A requirement with two sources.",
    },
    {
      fieldPath: "requirements.structure",
      method: "model",
      confidence: 1,
      sourceLocator: "CBE List 1",
      sourceExcerpt: "BUSN1001 is listed.",
      sourceUrl: CBE_LIST_ONE_2024_URL,
    },
  ];
  const fixture = await createSyncFixture(EVIDENCE_CODE, "d".repeat(64));
  const [source] = await sql`
    insert into public.catalogue_sources (name, kind, base_url)
    values ('CBE List 1 test', 'linked_course_list', 'https://cbe.anu.edu.au')
    on conflict (kind, base_url) do update set name = excluded.name
    returning id
  `;
  const [supporting] = await sql`
    insert into public.catalogue_source_documents (
      source_id, record_id, academic_year_id, kind, external_key,
      canonical_url, content_sha256, http_status, fetched_at
    ) values (
      ${source.id}, ${fixture.claim.recordId}, ${yearId}, 'course', 'cbe-list-1-2024',
      ${CBE_LIST_ONE_2024_URL}, ${"e".repeat(64)}, 200, now()
    ) on conflict (source_id, record_id, content_sha256) do nothing
    returning id
  `;
  const [document] = supporting
    ? [supporting]
    : await sql`
        select id from public.catalogue_source_documents
        where source_id = ${source.id} and record_id = ${fixture.claim.recordId}
          and content_sha256 = ${"e".repeat(64)}
      `;
  const sourceDocumentIdsByUrl = new Map([
    [CBE_LIST_ONE_2024_URL, Number(document.id)],
  ]);
  await assert.rejects(
    persistSourceVersion(sql, {
      claim: fixture.claim,
      sourceDocumentId: fixture.documentId,
      sourceDocumentIdsByUrl: new Map([
        [CBE_LIST_ONE_2024_URL, fixture.documentId],
      ]),
      write: content,
    }),
    /does not belong to this catalogue record/u,
  );
  const saved = await persistSourceVersion(sql, {
    claim: fixture.claim,
    sourceDocumentId: fixture.documentId,
    sourceDocumentIdsByUrl,
    write: content,
  });
  const evidence = await sql`
    select field_path, source_document_id from public.catalogue_version_provenance
    where version_id = ${saved.sourceVersionId} order by id
  `;
  assert.deepEqual(
    evidence.map((row) => [row.field_path, Number(row.source_document_id)]),
    [
      ["description", fixture.documentId],
      ["requirements.structure", Number(document.id)],
    ],
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
});

test("extraction storage distinguishes unavailable metrics from measured and cached zero", async () => {
  const fixture = await createSyncFixture(EMPTY_CODE, "c".repeat(64));
  const syncId = fixture.claim.syncId;
  await sql`update public.catalogue_syncs set status = 'failed' where id = ${syncId}::uuid`;
  const stageId = await startSyncStage(sql, {
    syncId,
    stageName: "model_extract",
    attemptNumber: 1,
  });
  const artifact = await recordSyncArtifact(sql, {
    syncId,
    stageId,
    kind: "model_request",
    attemptNumber: 1,
    mediaType: "application/json",
    contentSha256: "d".repeat(64),
    byteSize: 2,
    storageBucket: "course-import-artifacts",
    storagePath: "test-only/usage.json",
  });
  const unknown = {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    costUsd: null,
  };
  let originalExtractionId;
  for (const [index, usage, reused] of [
    [1, unknown, false],
    [2, { ...unknown, inputTokens: 0, outputTokens: 0, costUsd: 0 }, false],
    [3, unknown, true],
  ]) {
    const reserved = await reserveExtraction(sql, {
      syncId,
      extractionNumber: index,
      requestedModel: "test",
      fingerprint: String(index).repeat(64),
      promptVersion: "test",
      schemaVersion: "test",
      requestArtifactId: artifact.id,
    });
    if (index === 1) originalExtractionId = reserved.id;
    const [pending] =
      await sql`select input_tokens, cost_usd from public.catalogue_extractions where id = ${reserved.id}::uuid`;
    assert.equal(pending.input_tokens, null);
    assert.equal(pending.cost_usd, null);
    await attachExtractionResponse(sql, {
      extractionId: reserved.id,
      responseArtifactId: artifact.id,
      resolvedModel: "test",
      reusedFromExtractionId: reused ? originalExtractionId : null,
      providerRequestId: null,
      finishReason: "error",
      latencyMs: 10,
      ...extractionUsageForStorage(usage, reused),
    });
    const [stored] =
      await sql`select input_tokens, output_tokens, cost_usd, cost_source from public.catalogue_extractions where id = ${reserved.id}::uuid`;
    assert.equal(stored.input_tokens, usage.inputTokens);
    assert.equal(stored.output_tokens, usage.outputTokens);
    assert.equal(
      stored.cost_usd === null ? null : Number(stored.cost_usd),
      reused ? 0 : usage.costUsd,
    );
    assert.equal(
      stored.cost_source,
      reused ? "cache" : usage.costUsd === null ? "unknown" : "provider",
    );
  }
});

test("only definitive request failures permit a new reservation for identical input", async () => {
  const fixture = await createSyncFixture(EMPTY_CODE, "e".repeat(64));
  const syncId = fixture.claim.syncId;
  await sql`update public.catalogue_syncs set status = 'failed' where id = ${syncId}::uuid`;
  const stageId = await startSyncStage(sql, {
    syncId,
    stageName: "model_extract",
    attemptNumber: 1,
  });
  const artifact = await recordSyncArtifact(sql, {
    syncId,
    stageId,
    kind: "model_request",
    attemptNumber: 1,
    mediaType: "application/json",
    contentSha256: "f".repeat(64),
    byteSize: 2,
    storageBucket: "course-import-artifacts",
    storagePath: "test-only/outcome.json",
  });
  const request = {
    syncId,
    requestedModel: "test",
    fingerprint: "e".repeat(64),
    promptVersion: "test",
    schemaVersion: "test",
    requestArtifactId: artifact.id,
  };
  const first = await reserveExtraction(sql, {
    ...request,
    extractionNumber: 1,
  });
  const uncertain = await reserveExtraction(sql, {
    ...request,
    extractionNumber: 2,
  });
  assert.equal(uncertain.created, false);
  assert.equal(uncertain.id, first.id);
  assert.equal(uncertain.responseArtifactId, null);
  await recordExtractionRequestFailure(sql, {
    extractionId: first.id,
    outcome: "rejected",
    providerHttpStatus: 503,
    errorSummary: "Provider temporarily unavailable.",
  });
  const [rejected] =
    await sql`select request_outcome, provider_http_status, validation_status, cost_usd from public.catalogue_extractions where id = ${first.id}::uuid`;
  assert.equal(rejected.request_outcome, "rejected");
  assert.equal(rejected.provider_http_status, 503);
  assert.equal(rejected.validation_status, "invalid");
  assert.equal(rejected.cost_usd, null);
  const second = await reserveExtraction(sql, {
    ...request,
    extractionNumber: 2,
  });
  assert.equal(second.created, true);
  assert.notEqual(second.id, first.id);
  await recordExtractionRequestFailure(sql, {
    extractionId: second.id,
    outcome: "not_sent",
    providerHttpStatus: null,
    errorSummary: "No provider key was configured.",
  });
  const third = await reserveExtraction(sql, {
    ...request,
    extractionNumber: 3,
  });
  assert.equal(third.created, true);
  assert.notEqual(third.id, second.id);
  await attachExtractionResponse(sql, {
    extractionId: third.id,
    responseArtifactId: artifact.id,
    resolvedModel: "test",
    reusedFromExtractionId: null,
    providerRequestId: "reported-response",
    finishReason: "stop",
    latencyMs: 10,
    ...extractionUsageForStorage(
      {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        totalTokens: null,
        costUsd: null,
      },
      false,
    ),
  });
  const restored = await reserveExtraction(sql, {
    ...request,
    extractionNumber: 4,
  });
  assert.equal(restored.created, false);
  assert.equal(restored.id, third.id);
  assert.equal(restored.responseArtifactId, artifact.id);
  await assert.rejects(
    recordExtractionRequestFailure(sql, {
      extractionId: third.id,
      outcome: "rejected",
      providerHttpStatus: 503,
      errorSummary: "A response must not be overwritten.",
    }),
    (error) => error.code === "EXTRACTION_OUTCOME_CONFLICT",
  );
});

test("first, unchanged and changed source observations preserve local intent", async () => {
  const emptyRecordId = records.get(EMPTY_CODE);
  const emptyDraft = emptyCatalogueContent({
    kind: "course",
    code: EMPTY_CODE,
    academicYear: YEAR,
    title: "Empty Source Record",
  });
  emptyDraft.contentHash = contentHashForCatalogueContent(emptyDraft);
  await sql`
    insert into public.catalogue_drafts (
      record_id, content, content_hash, content_schema_version, revision
    ) values (${emptyRecordId}, ${sql.json(emptyDraft)}, ${emptyDraft.contentHash},
      ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 0)
  `;

  const firstContent = sourceContent(
    EMPTY_CODE,
    "Empty Source Record",
    "First ANU description.",
  );
  const filterModel = emptyCourseExtraction({
    code: EMPTY_CODE,
    year: YEAR,
    title: "Empty Source Record",
  });
  filterModel.requisites.prerequisiteText =
    "6 units of 1000-level COMP courses";
  filterModel.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      {
        op: "min_units_at_level",
        minimumUnits: 6,
        level: 1000,
        maximumLevel: 1000,
        subjectCode: "COMP",
      },
      { op: "completed", courseCode: "COMP1100", minimumMark: 60 },
      { op: "min_courses_from_subject", minimumCount: 1, subjectCode: "STAT" },
      {
        op: "one_of",
        rules: [
          {
            op: "minimum_gpa",
            value: 5,
            scale: "anu7",
            recentGradedUnits: null,
          },
          { op: "minimum_gpa", value: 5, scale: "anu7", recentGradedUnits: 48 },
        ],
      },
      {
        op: "one_of",
        rules: [
          { op: "completed_or_concurrent", courseCode: "ECON2101" },
          { op: "completed_or_concurrent", courseCode: "ECON2111" },
          { op: "equivalent_course", sourceText: "or equivalent" },
        ],
      },
      {
        op: "permission",
        sourceText:
          "Permission of the College of Business and Economics is required.",
      },
    ],
  };
  filterModel.requisites.incompatibilityText =
    "Cannot enrol after completing, or concurrently with, MATH1005. Avoid concurrently taking COMP1600.";
  filterModel.requisites.incompatibilityCourseCodes = ["MATH1005"];
  filterModel.requisites.concurrentIncompatibilityCourseCodes = ["MATH1005"];
  filterModel.requisites.softConcurrentIncompatibilityCourseCodes = [
    "COMP1600",
  ];
  filterModel.requisites.assumedKnowledgeText =
    "Familiarity with matrix algebra is recommended.";
  filterModel.offerings = [
    {
      position: 1,
      calendarYear: YEAR,
      periodCode: "SPRING",
      periodName: "Spring Session",
      classNumber: "9504",
      startsOn: "2026-10-01",
      endsOn: "2027-02-07",
      lastEnrolmentDate: "2026-11-01",
      censusDate: "2026-12-13",
      deliveryMode: "In Person",
      location: null,
      classSummaryUrl: null,
      sourceText: "Spring Session, 1 Oct 2026 to 7 Feb 2027.",
    },
  ];
  const filterContent = courseCatalogueContent({
    projection: projectCourseSnapshot(filterModel),
  });
  firstContent.requirements = filterContent.requirements;
  firstContent.course.offering = filterContent.course.offering;
  firstContent.course.tags = [{ position: 1, name: "Reviewed Test Category" }];
  firstContent.course.sessions = filterContent.course.sessions;
  firstContent.course.details.workloadHours = 10;
  firstContent.course.details.workloadHoursBasis = "weekly";
  firstContent.course.details.workloadText =
    "Students are expected to work 10 hours per week.";
  firstContent.contentHash = contentHashForCatalogueContent(firstContent);
  firstContent.evidence = [0.95, 0.7, 0.7].map((confidence, index) => ({
    fieldPath: "description",
    method: "model",
    confidence,
    sourceLocator: `#description-${index}`,
    sourceExcerpt: "First ANU description.",
  }));
  const firstFixture = await createSyncFixture(EMPTY_CODE, "1".repeat(64));
  const first = await persistSourceVersion(sql, {
    claim: firstFixture.claim,
    sourceDocumentId: firstFixture.documentId,
    write: firstContent,
  });
  assert.equal(first.status, "applied");
  assert.equal(first.populatedDraft, true);
  const replayedFirst = await persistSourceVersion(sql, {
    claim: firstFixture.claim,
    sourceDocumentId: firstFixture.documentId,
    write: firstContent,
  });
  assert.deepEqual(replayedFirst, first);
  const [firstVersionCount] = await sql`
    select count(*)::integer as count from public.catalogue_versions
    where sync_id = ${firstFixture.claim.syncId}
  `;
  assert.equal(firstVersionCount.count, 1);
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now()
    where id = ${firstFixture.claim.syncId}`;
  const [populated] = await sql`
    select content, base_version_id from public.catalogue_drafts where record_id = ${emptyRecordId}
  `;
  assert.equal(
    populated.content.course.details.description,
    "First ANU description.",
  );
  assert.equal(Number(populated.base_version_id), first.sourceVersionId);

  const [persistedFilter] =
    await sql`select subject_code, minimum_level, maximum_level, minimum_units from public.requirement_conditions where version_id = ${first.sourceVersionId} and condition_kind = 'level_units'`;
  assert.equal(persistedFilter.subject_code, "COMP");
  assert.equal(Number(persistedFilter.minimum_level), 1000);
  assert.equal(Number(persistedFilter.maximum_level), 1000);
  assert.equal(Number(persistedFilter.minimum_units), 6);

  const [persistedCount] =
    await sql`select subject_code, minimum_count, minimum_units, maximum_units from public.requirement_conditions where version_id = ${first.sourceVersionId} and condition_kind = 'subject_courses'`;
  assert.equal(persistedCount.subject_code, "STAT");
  assert.equal(Number(persistedCount.minimum_count), 1);
  assert.equal(persistedCount.minimum_units, null);
  assert.equal(persistedCount.maximum_units, null);

  const persistedAverages = await sql`
    select minimum_gpa, minimum_count from public.requirement_conditions
    where version_id = ${first.sourceVersionId} and condition_kind = 'gpa'
    order by position
  `;
  assert.deepEqual(
    persistedAverages.map((condition) => [
      Number(condition.minimum_gpa),
      condition.minimum_count === null ? null : Number(condition.minimum_count),
    ]),
    [
      [5, null],
      [5, 48],
    ],
  );

  const [persistedEquivalent] = await sql`
    select condition_kind, free_text, source_text
    from public.requirement_conditions
    where version_id = ${first.sourceVersionId} and condition_kind = 'other'
      and free_text = 'or equivalent'
  `;
  assert.deepEqual(
    [
      persistedEquivalent.condition_kind,
      persistedEquivalent.free_text,
      persistedEquivalent.source_text,
    ],
    ["other", "or equivalent", "or equivalent"],
  );

  const persistedExclusions =
    await sql`select condition_kind, hardness, code.code from public.requirement_conditions condition join public.catalogue_codes code on code.id = condition.code_id where condition.version_id = ${first.sourceVersionId} and condition.condition_kind in ('incompatible', 'incompatible_concurrent') order by condition.position`;
  assert.deepEqual(
    persistedExclusions.map((condition) => [
      condition.condition_kind,
      condition.code,
      condition.hardness,
    ]),
    [
      ["incompatible", "MATH1005", "hard"],
      ["incompatible_concurrent", "MATH1005", "hard"],
      ["incompatible_concurrent", "COMP1600", "advisory"],
    ],
  );

  const [persistedMark] =
    await sql`select minimum_mark from public.requirement_conditions where version_id = ${first.sourceVersionId} and condition_kind = 'course'`;
  assert.equal(Number(persistedMark.minimum_mark), 60);

  const [persistedPermission] =
    await sql`select free_text, source_text from public.requirement_conditions where version_id = ${first.sourceVersionId} and condition_kind = 'permission'`;
  assert.equal(
    persistedPermission.free_text,
    "Permission of the College of Business and Economics is required.",
  );
  assert.equal(persistedPermission.source_text, persistedPermission.free_text);

  const [persistedKnowledge] =
    await sql`select condition.hardness, condition.free_text, rule.hardness as rule_hardness from public.requirement_conditions condition join public.requirement_rules rule on rule.id = condition.rule_id where condition.version_id = ${first.sourceVersionId} and rule.rule_kind = 'assumed_knowledge'`;
  assert.equal(persistedKnowledge.hardness, "advisory");
  assert.equal(persistedKnowledge.rule_hardness, "advisory");
  assert.equal(
    persistedKnowledge.free_text,
    "Familiarity with matrix algebra is recommended.",
  );

  const knownPeriods = await loadKnownAcademicPeriods(sql, YEAR);
  assert.ok(knownPeriods.some((period) => period.code === "SPRING"));
  const [persistedSession] =
    await sql`select starts_on::text, ends_on::text, academic_period_id from public.offering_sessions where version_id = ${first.sourceVersionId}`;
  assert.ok(persistedSession.academic_period_id);
  assert.equal(persistedSession.starts_on, "2026-10-01");
  assert.equal(persistedSession.ends_on, "2027-02-07");

  const [persistedWorkload] =
    await sql`select workload_hours, workload_hours_basis from public.course_version_details where version_id = ${first.sourceVersionId}`;
  assert.equal(Number(persistedWorkload.workload_hours), 10);
  assert.equal(persistedWorkload.workload_hours_basis, "weekly");
  const [projection] =
    await sql`select private.course_version_projection(${first.sourceVersionId}) as content`;
  assert.equal(projection.content.snapshot.workloadHoursBasis, "weekly");
  const projectedCount = projection.content.ruleConditions.find(
    (condition) => condition.conditionKind === "subject_courses",
  );
  assert.equal(projectedCount.minimumCount, 1);
  assert.equal(projectedCount.minimumUnits, null);
  assert.equal(projectedCount.subjectCode, "STAT");
  assert.deepEqual(
    projection.content.ruleConditions
      .filter((condition) => condition.conditionKind === "gpa")
      .map((condition) => condition.minimumCount),
    [null, 48],
  );
  assert.equal(
    projection.content.ruleConditions.find(
      (condition) =>
        condition.conditionKind === "other" &&
        condition.ruleKey === "prerequisite",
    )?.freeText,
    "or equivalent",
  );
  const exclusion = readProjectionIncompatibilityRule(projection.content);
  assert.ok(
    exclusion.relationalExpression.conditions.some(
      (condition) =>
        condition.kind === "incompatible_concurrent" &&
        condition.code === "MATH1005",
    ),
  );
  assert.ok(
    exclusion.relationalExpression.conditions.some(
      (condition) =>
        condition.kind === "incompatible_concurrent" &&
        condition.code === "COMP1600" &&
        condition.hardness === "advisory",
    ),
  );
  const prerequisite = readProjectionPrerequisiteRule(projection.content);
  assert.ok(
    prerequisite.relationalExpression.conditions.some(
      (condition) =>
        condition.kind === "subject_courses" &&
        condition.minimumCount === 1 &&
        condition.subject === "STAT",
    ),
  );
  assert.equal(
    (await loadKnownCourseTags(sql)).includes("Reviewed Test Category"),
    false,
  );
  await sql
    .begin(async (transaction) => {
      await transaction`update public.catalogue_records set published_version_id = ${first.sourceVersionId} where id = ${emptyRecordId}`;
      assert.equal(
        (await loadKnownCourseTags(transaction)).includes(
          "Reviewed Test Category",
        ),
        true,
      );
      await transaction`update public.catalogue_records set archived_at = now() where id = ${emptyRecordId}`;
      assert.equal(
        (await loadKnownCourseTags(transaction)).includes(
          "Reviewed Test Category",
        ),
        false,
      );
      throw new Error("Rollback tag vocabulary fixture");
    })
    .catch((error) => {
      assert.equal(error.message, "Rollback tag vocabulary fixture");
    });

  for (const [basis, hours] of [
    ["daily", 10],
    ["weekly", null],
  ]) {
    const invalidFixture = await createSyncFixture(
      EMPTY_CODE,
      basis === "daily" ? "7".repeat(64) : "8".repeat(64),
    );
    const invalid = structuredClone(firstContent);
    invalid.course.details.workloadHoursBasis = basis;
    invalid.course.details.workloadHours = hours;
    invalid.contentHash = contentHashForCatalogueContent(invalid);
    await assert.rejects(
      persistSourceVersion(sql, {
        claim: invalidFixture.claim,
        sourceDocumentId: invalidFixture.documentId,
        write: invalid,
      }),
      { code: "23514" },
    );
    await sql`update public.catalogue_syncs set status = 'failed', completed_at = now()
      where id = ${invalidFixture.claim.syncId}`;
  }

  for (const [index, values] of [
    { minimumCount: null },
    { minimumCount: 0 },
    { minimumUnits: 6 },
    { subjectCode: "ST" },
  ].entries()) {
    const fixture = await createSyncFixture(
      EMPTY_CODE,
      String(index + 2).repeat(64),
    );
    const invalid = structuredClone(firstContent);
    Object.assign(
      invalid.requirements.conditions.find(
        (condition) => condition.kind === "subject_courses",
      ),
      values,
    );
    invalid.contentHash = contentHashForCatalogueContent(invalid);
    await assert.rejects(
      persistSourceVersion(sql, {
        claim: fixture.claim,
        sourceDocumentId: fixture.documentId,
        write: invalid,
      }),
      { code: "23514" },
    );
    await sql`update public.catalogue_syncs set status = 'failed', completed_at = now() where id = ${fixture.claim.syncId}`;
  }

  const sourceEvidence =
    await sql`select id, confidence from public.catalogue_version_provenance where version_id = ${first.sourceVersionId} order by id`;
  assert.equal(sourceEvidence.length, 3);
  const draftEvidence =
    await sql`select source_evidence_id from public.catalogue_draft_provenance where record_id = ${emptyRecordId} and field_path = 'description'`;
  assert.equal(draftEvidence.length, 1);
  assert.equal(
    Number(draftEvidence[0].source_evidence_id),
    Number(sourceEvidence[1].id),
  );
  const unchangedFixture = await createSyncFixture(EMPTY_CODE, "1".repeat(64));
  const unchanged = await persistSourceVersion(sql, {
    claim: unchangedFixture.claim,
    sourceDocumentId: unchangedFixture.documentId,
    write: firstContent,
  });
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.sourceVersionId, first.sourceVersionId);
  await sql`update public.catalogue_syncs set status = 'unchanged', completed_at = now()
    where id = ${unchangedFixture.claim.syncId}`;

  const changedContent = sourceContent(
    EMPTY_CODE,
    "Empty Source Record",
    "Changed ANU description.",
  );
  const changedFixture = await createSyncFixture(EMPTY_CODE, "2".repeat(64));
  const changed = await persistSourceVersion(sql, {
    claim: changedFixture.claim,
    sourceDocumentId: changedFixture.documentId,
    write: changedContent,
  });
  assert.equal(changed.status, "review_required");
  const [unchangedDraft] = await sql`
    select content from public.catalogue_drafts where record_id = ${emptyRecordId}
  `;
  assert.equal(
    unchangedDraft.content.course.details.description,
    "First ANU description.",
  );

  const manualRecordId = records.get(MANUAL_CODE);
  const manualDraft = sourceContent(
    MANUAL_CODE,
    "Manual Source Record",
    "Locally authored description.",
  );
  await sql`
    insert into public.catalogue_drafts (
      record_id, content, content_hash, content_schema_version, revision
    ) values (${manualRecordId}, ${sql.json(manualDraft)}, ${manualDraft.contentHash},
      ${CATALOGUE_CONTENT_SCHEMA_VERSION}, 1)
  `;
  const manualFirstContent = sourceContent(
    MANUAL_CODE,
    "Manual Source Record",
    "ANU description.",
  );
  const manualFixture = await createSyncFixture(MANUAL_CODE, "3".repeat(64));
  const manualFirst = await persistSourceVersion(sql, {
    claim: manualFixture.claim,
    sourceDocumentId: manualFixture.documentId,
    write: manualFirstContent,
  });
  assert.equal(manualFirst.status, "review_required");
  const [manualStillLocal] = await sql`
    select content from public.catalogue_drafts where record_id = ${manualRecordId}
  `;
  assert.equal(
    manualStillLocal.content.course.details.description,
    "Locally authored description.",
  );
});

test("course identity context requires a current year-specific source-backed listing", async () => {
  const rollback = new Error("Roll back course identity fixtures.");
  try {
    await sql.begin(async (tx) => {
      const [page] =
        await tx`insert into public.catalogue_source_pages (source_id, academic_year_id, kind, external_key, canonical_url, content_sha256) values (${sourceId}, ${yearId}, 'directory', 'test-course-identity-context', 'https://programsandcourses.anu.edu.au/2026/CourseSearch', ${"9".repeat(64)}) returning id`;
      await tx`update public.catalogue_listings set source_page_id = ${page.id} where code = ${MANUAL_CODE} and academic_year_id = ${yearId}`;
      const identities = await loadKnownCourseIdentities(tx, Number(yearId));
      assert.deepEqual(
        identities.filter(({ code }) =>
          [EMPTY_CODE, MANUAL_CODE].includes(code),
        ),
        [{ code: MANUAL_CODE, name: "Manual Source Record" }],
      );
      assert.equal((await loadKnownCourseIdentities(tx, -1)).length, 0);
      await tx`update public.catalogue_listings set is_current = false where code = ${MANUAL_CODE} and academic_year_id = ${yearId}`;
      assert.equal(
        (await loadKnownCourseIdentities(tx, Number(yearId))).some(
          ({ code }) => code === MANUAL_CODE,
        ),
        false,
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test.each([
  ["absent", null, false],
  ["absent with sessions", null, true],
  ["explicitly empty", { deliveryMode: null, location: null }, false],
  [
    "explicitly empty with sessions",
    { deliveryMode: null, location: null },
    true,
  ],
  ["partial", { deliveryMode: "In Person", location: null }, false],
  ["partial with sessions", { deliveryMode: null, location: "Acton" }, true],
])(
  "%s offering summaries retain their source shape and hash",
  async (label, offering, hasSessions) => {
    const content = sourceContent(
      OFFERING_CODE,
      `Offering ${label}`,
      "Offering roundtrip test.",
    );
    content.course.offering = offering;
    if (hasSessions) {
      content.course.sessions = [
        {
          position: 1,
          calendarYear: YEAR,
          academicPeriodCode: "SEM1",
          academicPeriodName: "First Semester",
          classNumber: "9104",
          startsOn: null,
          enrolClosesOn: null,
          censusOn: null,
          endsOn: null,
          deliveryMode: "In Person",
          location: "Acton",
          classSummaryUrl: null,
          sourceText: "First Semester, Acton, In Person.",
        },
      ];
    }
    content.contentHash = contentHashForCatalogueContent(content);
    const fixture = await createSyncFixture(OFFERING_CODE, content.contentHash);
    const first = await persistSourceVersion(sql, {
      claim: fixture.claim,
      sourceDocumentId: fixture.documentId,
      write: content,
    });
    const roundtrip = await readVersionContent(sql, first.sourceVersionId);
    assert.deepEqual(roundtrip.course, content.course);
    assert.equal(
      contentHashForCatalogueContent(roundtrip),
      content.contentHash,
    );
    const [stored] =
      await sql`select content_hash, sealed_at from public.catalogue_versions where id = ${first.sourceVersionId}`;
    assert.equal(stored.content_hash, content.contentHash);
    assert.ok(stored.sealed_at);
    const [row] =
      await sql`select delivery_mode, location, has_summary from public.course_offerings where version_id = ${first.sourceVersionId}`;
    assert.deepEqual(row, {
      delivery_mode: offering?.deliveryMode ?? null,
      location: offering?.location ?? null,
      has_summary: offering !== null,
    });
    const [projection] =
      await sql`select private.course_version_projection(${first.sourceVersionId}) as content`;
    assert.deepEqual(projection.content.courseOffering, offering);
    await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
    const replay = await createSyncFixture(OFFERING_CODE, content.contentHash);
    const repeated = await persistSourceVersion(sql, {
      claim: replay.claim,
      sourceDocumentId: replay.documentId,
      write: roundtrip,
    });
    assert.equal(repeated.status, "unchanged");
    assert.equal(repeated.sourceVersionId, first.sourceVersionId);
    await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${replay.claim.syncId}`;
  },
);

test.each([
  ["absent", null, true],
  ["explicitly empty", { deliveryMode: null, location: null }, true],
  ["unrecognised", null, false],
])(
  "%s historical offering summaries preserve immutable evidence",
  async (label, offering, hasRecognisedHash) => {
    const content = sourceContent(
      OFFERING_CODE,
      `Historical ${label} offering hash`,
      "Historical snapshot test.",
    );
    content.course.offering = offering;
    content.contentHash = hasRecognisedHash
      ? contentHashForCatalogueContent(content)
      : "f".repeat(64);
    const fixture = await createSyncFixture(OFFERING_CODE, content.contentHash);
    const result = await persistSourceVersion(sql, {
      claim: fixture.claim,
      sourceDocumentId: fixture.documentId,
      write: content,
    });
    // Reproduce pre-marker storage without changing the recorded snapshot hash.
    await sql`alter table public.course_offerings disable trigger course_offerings_guard_sealed`;
    try {
      await sql`update public.course_offerings set has_summary = null where version_id = ${result.sourceVersionId}`;
    } finally {
      await sql`alter table public.course_offerings enable trigger course_offerings_guard_sealed`;
    }
    const roundtrip = await readVersionContent(sql, result.sourceVersionId);
    assert.deepEqual(
      roundtrip.course.offering,
      hasRecognisedHash ? offering : { deliveryMode: null, location: null },
    );
    assert.equal(roundtrip.contentHash, content.contentHash);
    if (hasRecognisedHash)
      assert.equal(
        contentHashForCatalogueContent(roundtrip),
        content.contentHash,
      );
    const [stored] =
      await sql`select versions.content_hash, offerings.has_summary from public.catalogue_versions as versions join public.course_offerings as offerings on offerings.version_id = versions.id where versions.id = ${result.sourceVersionId}`;
    assert.equal(stored.content_hash, content.contentHash);
    assert.equal(stored.has_summary, null);
    await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
  },
);

test("model projection hashes preserve absent offering summaries independently of draft hashes", async () => {
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(
      emptyCourseExtraction({
        code: OFFERING_CODE,
        year: YEAR,
        title: "Model offering hash",
      }),
    ),
  });
  assert.equal(content.course.offering, null);
  assert.notEqual(content.contentHash, contentHashForCatalogueContent(content));
  const fixture = await createSyncFixture(OFFERING_CODE, content.contentHash);
  const result = await persistSourceVersion(sql, {
    claim: fixture.claim,
    sourceDocumentId: fixture.documentId,
    write: content,
  });
  const roundtrip = await readVersionContent(sql, result.sourceVersionId);
  assert.deepEqual(roundtrip.course, content.course);
  assert.equal(roundtrip.contentHash, content.contentHash);
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
});

test("college eligibility survives persistence and unchanged replay with invalid values rolled back", async () => {
  const college = "ANU College of Business and Economics";
  const model = emptyCourseExtraction({
    code: OFFERING_CODE,
    year: YEAR,
    title: "College eligibility persistence",
  });
  model.requisites.prerequisiteText = "You must be enrolled in a CBE degree.";
  model.requisites.prerequisiteRule = { op: "enrolled_in_college", college };
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
  });
  content.contentHash = contentHashForCatalogueContent(content);
  const fixture = await createSyncFixture(OFFERING_CODE, content.contentHash);
  const result = await persistSourceVersion(sql, {
    claim: fixture.claim,
    sourceDocumentId: fixture.documentId,
    write: content,
  });
  const roundtrip = await readVersionContent(sql, result.sourceVersionId);
  assert.deepEqual(roundtrip.requirements, content.requirements);
  assert.equal(contentHashForCatalogueContent(roundtrip), content.contentHash);
  const [projection] =
    await sql`select private.course_version_projection(${result.sourceVersionId}) as content`;
  assert.equal(
    readProjectionPrerequisiteRule(projection.content).relationalExpression
      .conditions[0].college,
    college,
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
  const repeated = await createSyncFixture(OFFERING_CODE, content.contentHash);
  assert.equal(
    (
      await persistSourceVersion(sql, {
        claim: repeated.claim,
        sourceDocumentId: repeated.documentId,
        write: roundtrip,
      })
    ).status,
    "unchanged",
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${repeated.claim.syncId}`;
  for (const freeText of [null, " "]) {
    const invalid = structuredClone(content);
    invalid.requirements.conditions[0].freeText = freeText;
    invalid.contentHash = contentHashForCatalogueContent(invalid);
    const attempt = await createSyncFixture(OFFERING_CODE, invalid.contentHash);
    await assert.rejects(
      persistSourceVersion(sql, {
        claim: attempt.claim,
        sourceDocumentId: attempt.documentId,
        write: invalid,
      }),
      (error) => error.code === "23514",
    );
    const [count] =
      await sql`select count(*)::int as count from public.catalogue_versions where sync_id = ${attempt.claim.syncId}`;
    assert.equal(count.count, 0);
    await sql`update public.catalogue_syncs set status = 'failed', completed_at = now() where id = ${attempt.claim.syncId}`;
  }
});

test("conditional enrolment permissions survive persistence, projection and unchanged replay", async () => {
  const model = emptyCourseExtraction({
    code: OFFERING_CODE,
    year: YEAR,
    title: "Enrolment scope persistence",
  });
  model.requisites.prerequisiteText =
    "24 units; Flexible Double Degree students need school permission.";
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 24 },
      {
        op: "one_of",
        rules: [
          {
            op: "enrolment_mode",
            mode: "flexible_double_degree",
            matches: false,
          },
          {
            op: "all_of",
            rules: [
              {
                op: "enrolment_mode",
                mode: "flexible_double_degree",
                matches: true,
              },
              {
                op: "permission",
                sourceText: "Permission from info.cbe@anu.edu.au.",
              },
            ],
          },
        ],
      },
    ],
  };
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
  });
  content.contentHash = contentHashForCatalogueContent(content);
  const fixture = await createSyncFixture(OFFERING_CODE, content.contentHash);
  const result = await persistSourceVersion(sql, {
    claim: fixture.claim,
    sourceDocumentId: fixture.documentId,
    write: content,
  });
  const stored =
    await sql`select enrolment_mode, matches_enrolment_mode from public.requirement_conditions where version_id = ${result.sourceVersionId} and condition_kind = 'enrolment_mode' order by position, id`;
  assert.deepEqual(
    stored.map((row) => [row.enrolment_mode, row.matches_enrolment_mode]),
    [
      ["flexible_double_degree", false],
      ["flexible_double_degree", true],
    ],
  );
  const roundtrip = await readVersionContent(sql, result.sourceVersionId);
  assert.deepEqual(roundtrip.requirements, content.requirements);
  assert.equal(contentHashForCatalogueContent(roundtrip), content.contentHash);
  assert.equal(
    roundtrip.requirements.conditions
      .filter((condition) => condition.kind !== "enrolment_mode")
      .some((condition) => "enrolmentMode" in condition),
    false,
  );
  const [projection] =
    await sql`select private.course_version_projection(${result.sourceVersionId}) as content`;
  const rule = readProjectionPrerequisiteRule(projection.content);
  assert.equal(
    rule.relationalExpression.conditions.find(
      (condition) => condition.kind === "group",
    ).conditions[0].matchesEnrolmentMode,
    false,
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
  const repeated = await createSyncFixture(OFFERING_CODE, content.contentHash);
  assert.equal(
    (
      await persistSourceVersion(sql, {
        claim: repeated.claim,
        sourceDocumentId: repeated.documentId,
        write: roundtrip,
      })
    ).status,
    "unchanged",
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${repeated.claim.syncId}`;
  for (const [enrolmentMode, matchesEnrolmentMode] of [
    [null, true],
    ["double", false],
    ["single_degree", null],
  ]) {
    const invalid = structuredClone(content);
    const condition = invalid.requirements.conditions.find(
      (item) => item.kind === "enrolment_mode",
    );
    condition.enrolmentMode = enrolmentMode;
    condition.matchesEnrolmentMode = matchesEnrolmentMode;
    invalid.contentHash = contentHashForCatalogueContent(invalid);
    const attempt = await createSyncFixture(OFFERING_CODE, invalid.contentHash);
    await assert.rejects(
      persistSourceVersion(sql, {
        claim: attempt.claim,
        sourceDocumentId: attempt.documentId,
        write: invalid,
      }),
      (error) => error.code === "23514",
    );
    const [count] =
      await sql`select count(*)::int as count from public.catalogue_versions where sync_id = ${attempt.claim.syncId}`;
    assert.equal(count.count, 0);
    await sql`update public.catalogue_syncs set status = 'failed', completed_at = now() where id = ${attempt.claim.syncId}`;
  }
});

test("cohort bounds survive source import, idempotent replay and published projection without changing legacy hashes", async () => {
  const model = emptyCourseExtraction({
    code: COHORT_CODE,
    year: YEAR,
    title: "Cohort Exception Record",
  });
  model.requisites.prerequisiteText =
    "COMP1100 or permission for students who commenced before 2021.";
  model.requisites.prerequisiteRule = {
    op: "one_of",
    rules: [
      { op: "completed", courseCode: "COMP1100" },
      {
        op: "all_of",
        rules: [
          { op: "commencement_year", minimumYear: null, maximumYear: 2020 },
          { op: "permission", sourceText: model.requisites.prerequisiteText },
        ],
      },
    ],
  };
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
  });
  content.contentHash = contentHashForCatalogueContent(content);
  const fixture = await createSyncFixture(COHORT_CODE, "a".repeat(64));
  const first = await persistSourceVersion(sql, {
    claim: fixture.claim,
    sourceDocumentId: fixture.documentId,
    write: content,
  });
  assert.equal(first.status, "applied");
  assert.deepEqual(
    await persistSourceVersion(sql, {
      claim: fixture.claim,
      sourceDocumentId: fixture.documentId,
      write: content,
    }),
    first,
  );
  const [stored] =
    await sql`select minimum_commencement_year, maximum_commencement_year, minimum_year from public.requirement_conditions where version_id = ${first.sourceVersionId} and condition_kind = 'commencement_year'`;
  assert.equal(stored.minimum_commencement_year, null);
  assert.equal(stored.maximum_commencement_year, 2020);
  assert.equal(stored.minimum_year, null);
  const [projection] =
    await sql`select private.course_version_projection(${first.sourceVersionId}) as content`;
  const projected = readProjectionPrerequisiteRule(projection.content);
  const cohort = projected.relationalExpression.conditions
    .find((condition) => condition.kind === "group")
    .conditions.find((condition) => condition.kind === "commencement_year");
  assert.equal(cohort.maximumCommencementYear, 2020);
  const roundtrip = await readVersionContent(sql, first.sourceVersionId);
  assert.equal(contentHashForCatalogueContent(roundtrip), content.contentHash);
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${fixture.claim.syncId}`;
  const legacyContent = courseCatalogueContent({
    projection: projectCourseSnapshot(
      emptyCourseExtraction({
        code: COHORT_CODE,
        year: YEAR,
        title: "Legacy-shaped course",
      }),
    ),
  });
  legacyContent.course.offering = { deliveryMode: "In Person", location: null };
  legacyContent.contentHash = contentHashForCatalogueContent(legacyContent);
  const legacyFixture = await createSyncFixture(COHORT_CODE, "c".repeat(64));
  const legacyResult = await persistSourceVersion(sql, {
    claim: legacyFixture.claim,
    sourceDocumentId: legacyFixture.documentId,
    write: legacyContent,
  });
  const legacy = await readVersionContent(sql, legacyResult.sourceVersionId);
  assert.equal(
    contentHashForCatalogueContent(legacy),
    legacyContent.contentHash,
  );
  assert.equal(
    legacy.requirements.conditions.some(
      (condition) => "minimumCommencementYear" in condition,
    ),
    false,
  );
  await sql`update public.catalogue_syncs set status = 'applied', completed_at = now() where id = ${legacyFixture.claim.syncId}`;
  for (const [minimum, maximum] of [
    [null, null],
    [2022, 2020],
    [1899, null],
    [null, 10000],
  ]) {
    const invalid = structuredClone(content);
    const condition = invalid.requirements.conditions.find(
      (item) => item.kind === "commencement_year",
    );
    condition.minimumCommencementYear = minimum;
    condition.maximumCommencementYear = maximum;
    invalid.contentHash = contentHashForCatalogueContent(invalid);
    const invalidFixture = await createSyncFixture(COHORT_CODE, "b".repeat(64));
    await assert.rejects(
      persistSourceVersion(sql, {
        claim: invalidFixture.claim,
        sourceDocumentId: invalidFixture.documentId,
        write: invalid,
      }),
      (error) => error.code === "23514",
    );
    const [versions] =
      await sql`select count(*)::integer as count from public.catalogue_versions where sync_id = ${invalidFixture.claim.syncId}`;
    assert.equal(versions.count, 0);
    await sql`update public.catalogue_syncs set status = 'failed', completed_at = now() where id = ${invalidFixture.claim.syncId}`;
  }
});
