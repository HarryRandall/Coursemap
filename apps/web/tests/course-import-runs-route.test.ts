import { afterEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/admin/course-import-runs/route";

const mocks = vi.hoisted(() => ({
  advance: vi.fn(),
  inline: vi.fn(),
  process: vi.fn(),
  after: [] as Array<() => unknown>,
}));
vi.mock("next/server", () => ({
  after: (work: () => unknown) => mocks.after.push(work),
}));
vi.mock("@/lib/catalogue-runs/service", () => ({
  advanceCourseRun: mocks.advance,
  cancelCourseRun: vi.fn(),
  createCourseRun: vi.fn(),
  parseCourseRunOptions: vi.fn(),
  previewCourseRun: vi.fn(),
  readCourseRuns: vi.fn(),
  readCourseRunItems: vi.fn(),
  requireCourseRunAdministrator: vi.fn(async () => ({ id: "admin" })),
}));
vi.mock("@/lib/catalogue-runs/structure-scope", () => ({
  importScopeCourseCodes: vi.fn(),
  listImportScopeStructures: vi.fn(),
}));
vi.mock("@/lib/catalogue-runs/publication", () => ({
  publishSavedCourseRunDrafts: vi.fn(),
  setCourseRunAutoPublish: vi.fn(),
}));
vi.mock("@/lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: vi.fn(),
}));
vi.mock("@/lib/catalogue-sync/sync-queue", () => ({
  processCatalogueSyncInline: mocks.inline,
}));
vi.mock("@/lib/catalogue-sync/process-sync", () => ({
  processCatalogueSync: mocks.process,
}));

afterEach(() => vi.unstubAllEnvs());

const RUN_ID = "10000000-0000-4000-8000-000000000001";

test("an inline run advance retries with the hosted queue's delivery budget", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
  mocks.advance.mockResolvedValue({ syncId: "sync", mode: "inline" });
  const response = await POST(
    new Request("http://localhost/api/admin/course-import-runs", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({ action: "advance", runId: RUN_ID }),
    }),
  );
  expect(await response.json()).toEqual({ dispatched: true });
  expect(mocks.after).toHaveLength(1);
  await mocks.after[0]!();
  expect(mocks.inline).toHaveBeenCalledWith({ syncId: "sync" });
  expect(mocks.process).not.toHaveBeenCalled();
});
