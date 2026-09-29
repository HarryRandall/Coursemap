import { readFile } from "node:fs/promises";
import { beforeEach, expect, test, vi } from "vitest";
import { processCatalogueSync } from "@/lib/catalogue-sync/process-sync";
import {
  COURSE_IMPORT_PARSER_VERSION,
  COURSE_IMPORT_PROMPT_VERSION,
  COURSE_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/catalogue-import/kinds/course/prompt";

const mocks = vi.hoisted(() => ({
  sql: vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>[]>>(
    async () => [],
  ),
  claim: vi.fn(),
  complete: vi.fn(),
  finish: vi.fn(),
  failStage: vi.fn(),
  persist: vi.fn(),
  extract: vi.fn(),
  store: vi.fn(),
  reserve: vi.fn(),
  reuse: vi.fn(),
  attach: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/catalogue-sync/sync-store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withSyncDatabaseClient: (work: (sql: unknown) => unknown) => work(mocks.sql),
  claimCatalogueSync: mocks.claim,
  startSyncStage: vi.fn(async () => "stage"),
  finishSyncStage: vi.fn(),
  failSyncStage: mocks.failStage,
  recordSourceDocument: vi.fn(async () => 1),
  recordSyncArtifact: vi.fn(async () => ({ id: "artifact" })),
  reserveExtraction: mocks.reserve,
  findReusableExtraction: mocks.reuse,
  attachExtractionResponse: mocks.attach,
  completeExtraction: mocks.complete,
  finishCatalogueSync: mocks.finish,
  readListingTitle: vi.fn(async () => "Relational Databases"),
}));
vi.mock("@/lib/catalogue-sync/artifact-store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSyncArtifact: mocks.store,
  readSyncArtifact: mocks.read,
}));
vi.mock("@/lib/catalogue-sync/persist-source-version", () => ({
  persistSourceVersion: mocks.persist,
}));
vi.mock("@/lib/catalogue-import/openrouter", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  extractWithOpenRouter: mocks.extract,
}));
vi.mock("@/lib/catalogue-import/kinds/course/source", () => ({
  fetchAnuCoursePage: vi.fn(async () => ({
    html: "<h1>Relational Databases</h1>",
    sourceError: null,
    contentSha256: "source-hash",
  })),
}));

const extraction = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/course-import/anu-2026-comp2400-extraction.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const unknownUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  cachedInputTokens: null,
  reasoningTokens: null,
  costUsd: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserve.mockResolvedValue({ id: "extraction", created: true });
  mocks.reuse.mockResolvedValue(null);
  mocks.sql.mockImplementation(async (strings) => {
    const query = Array.from(strings as unknown as readonly string[]).join("");
    if (query.includes("from public.academic_periods")) {
      return [
        { code: "S1", name: "First Semester" },
        { code: "S2", name: "Second Semester" },
      ];
    }
    if (query.includes("listings.kind = 'course'")) {
      return [{ code: "COMP2400", name: "Relational Databases" }];
    }
    return [];
  });
  mocks.claim.mockResolvedValue({
    syncId: "sync",
    kind: "course",
    code: "COMP2400",
    academicYear: 2026,
    requestedModel: "google/gemini-3.1-flash-lite",
    attemptCount: 1,
    lockVersion: 1,
    parserVersion: COURSE_IMPORT_PARSER_VERSION,
    promptVersion: COURSE_IMPORT_PROMPT_VERSION,
    schemaVersion: COURSE_SNAPSHOT_SCHEMA_VERSION,
  });
  mocks.store.mockImplementation(async ({ kind }) => ({
    mediaType: "application/json",
    contentSha256: kind,
    byteSize: 1,
    bucket: "test",
    path: kind,
  }));
  mocks.persist.mockResolvedValue({ status: "applied", sourceVersionId: 10 });
});

test("resuming an existing paid response preserves its original accounting", async () => {
  mocks.reserve.mockResolvedValue({
    id: "extraction",
    created: false,
    responseArtifactId: "original-response",
  });
  mocks.reuse.mockResolvedValue({ id: "extraction" });
  const audit = {
    model: "google/gemini-3.1-flash-lite",
    finishReason: "stop",
    content: JSON.stringify(extraction),
    latencyMilliseconds: 100,
    usage: {
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      costUsd: 0.03,
    },
  };
  mocks.read.mockResolvedValue(JSON.stringify(audit));
  mocks.sql.mockImplementation(async (strings) => {
    const query = Array.from(strings as unknown as readonly string[]).join("");
    if (query.includes("from public.catalogue_sync_artifacts"))
      return [
        {
          storage_bucket: "test",
          storage_path: "original-response",
          media_type: "application/json",
          content_sha256: "a".repeat(64),
          byte_size: 2,
        },
      ];
    if (query.includes("from public.academic_periods"))
      return [
        { code: "S1", name: "First Semester" },
        { code: "S2", name: "Second Semester" },
      ];
    return [];
  });
  await processCatalogueSync({ syncId: "sync" });
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(mocks.reuse).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
  expect(mocks.persist).toHaveBeenCalledTimes(1);
});

test("a new extraction reusing another response records zero additional cost", async () => {
  mocks.reuse.mockResolvedValue({
    id: "original-paid-extraction",
    responseArtifact: {
      bucket: "test",
      path: "original",
      mediaType: "application/json",
      contentSha256: "a".repeat(64),
      byteSize: 2,
    },
  });
  mocks.read.mockResolvedValue(
    JSON.stringify({
      model: "google/gemini-3.1-flash-lite",
      finishReason: "stop",
      content: JSON.stringify(extraction),
      latencyMilliseconds: 100,
      usage: { ...unknownUsage, costUsd: 0.03 },
    }),
  );
  await processCatalogueSync({ syncId: "sync" });
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(mocks.attach).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      reusedFromExtractionId: "original-paid-extraction",
      costUsd: 0,
      costSource: "cache",
    }),
  );
  expect(mocks.persist).toHaveBeenCalledTimes(1);
});

test.each([
  { parsed: null, responseError: "Invalid JSON.", finishReason: "stop" },
  { parsed: {}, responseError: null, finishReason: "stop" },
  { parsed: extraction, responseError: null, finishReason: "length" },
])(
  "failed or incomplete extraction preserves audit without writing catalogue content: $finishReason",
  async (response) => {
    mocks.extract.mockResolvedValue({
      ...response,
      responseForAudit: response,
      usage: unknownUsage,
      generationId: "paid-response",
    });
    await processCatalogueSync({ syncId: "sync" });
    expect(mocks.extract).toHaveBeenCalledTimes(1);
    expect(mocks.store.mock.calls.map(([input]) => input.kind)).toContain(
      "model_response",
    );
    expect(mocks.store.mock.calls.map(([input]) => input.kind)).toContain(
      "validation_report",
    );
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ domainValid: false }),
    );
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        errorCode: "MODEL_EXTRACTION_INVALID",
        sourceVersionId: null,
      }),
    );
  },
);

test("a complete response proceeds to source persistence", async () => {
  mocks.extract.mockResolvedValue({
    parsed: extraction,
    responseError: null,
    finishReason: "stop",
    responseForAudit: {},
    usage: unknownUsage,
  });
  await processCatalogueSync({ syncId: "sync" });
  expect(mocks.extract).toHaveBeenCalledWith(
    expect.objectContaining({
      modelInput: expect.stringContaining("COMP2400: Relational Databases"),
    }),
  );
  expect(mocks.persist).toHaveBeenCalledTimes(1);
  expect(mocks.attach).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      costSource: "unknown",
    }),
  );
  expect(mocks.finish).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "applied", sourceVersionId: 10 }),
  );
});

test("the worker gives the model calendar identities and holds unrecognised periods", async () => {
  const model = structuredClone(extraction);
  model.offerings[0].periodCode = "First Semester";
  mocks.extract.mockResolvedValue({
    parsed: model,
    responseError: null,
    finishReason: "stop",
    responseForAudit: {},
    usage: unknownUsage,
  });
  await processCatalogueSync({ syncId: "sync" });
  expect(mocks.extract).toHaveBeenCalledWith(
    expect.objectContaining({
      modelInput: expect.stringContaining("S1: First Semester"),
    }),
  );
  expect(mocks.complete).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ domainValid: false }),
  );
  const [, input] = mocks.persist.mock.calls[0];
  expect(input.write.course.sessions).toEqual([]);
  expect(input.write.flags).toContainEqual(
    expect.objectContaining({ fieldPath: "offerings[0]", severity: "error" }),
  );
});
