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
  reserveExtraction: vi.fn(async () => ({ id: "extraction", created: true })),
  findReusableExtraction: vi.fn(async () => null),
  attachExtractionResponse: vi.fn(),
  completeExtraction: mocks.complete,
  finishCatalogueSync: mocks.finish,
  readListingTitle: vi.fn(async () => "Relational Databases"),
}));
vi.mock("@/lib/catalogue-sync/artifact-store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storeSyncArtifact: mocks.store,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockImplementation(async (strings) =>
    Array.from(strings as unknown as readonly string[])
      .join("")
      .includes("from public.academic_periods")
      ? [
          { code: "S1", name: "First Semester" },
          { code: "S2", name: "Second Semester" },
        ]
      : [],
  );
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
      usage: {},
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
    usage: {},
  });
  await processCatalogueSync({ syncId: "sync" });
  expect(mocks.persist).toHaveBeenCalledTimes(1);
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
    usage: {},
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
