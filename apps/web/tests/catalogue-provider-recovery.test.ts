import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { recoverCatalogueImports } from "@/lib/catalogue-sync/provider-recovery";
import { POST } from "@/app/api/admin/catalogue-provider/route";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  rpc: vi.fn(),
  queue: vi.fn(),
  dispatch: vi.fn(),
  inline: vi.fn(),
  state: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: mocks.permission,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/coursemap/admin-operations", () => ({
  loadCatalogueProviderState: mocks.state,
}));
vi.mock("@/lib/catalogue-sync/sync-queue", () => ({
  syncQueueEnabled: mocks.queue,
  dispatchCatalogueSync: mocks.dispatch,
  processCatalogueSyncInline: mocks.inline,
}));
vi.mock("@/lib/catalogue-sync/process-sync", () => ({
  safeErrorSummary: (error: Error) => error.message,
}));
const syncs = [
  { id: "first", generation: 1 },
  { id: "second", generation: 1 },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.queue.mockReturnValue(true);
  mocks.rpc.mockResolvedValue({ data: { syncs }, error: null });
  mocks.dispatch.mockResolvedValue({ mode: "queue" });
  mocks.state.mockResolvedValue({ paused: false, revision: 2, heldCount: 0 });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
});
afterEach(() => vi.unstubAllEnvs());
test("dispatches bounded queue batches after an authorised atomic recovery", async () => {
  expect(
    await recoverCatalogueImports({ revision: 1, resume: true }),
  ).toMatchObject({ dispatched: 2, dispatchError: null });
  expect(mocks.rpc).toHaveBeenCalledWith("resume_catalogue_provider", {
    p_expected_revision: 1,
    p_resume: true,
    p_limit: 10,
  });
  expect(mocks.dispatch).toHaveBeenNthCalledWith(2, {
    syncId: "second",
    generation: 1,
  });
  expect(mocks.inline).not.toHaveBeenCalled();
});
test("inline recovery selects one job and passes a finite execution signal", async () => {
  mocks.queue.mockReturnValue(false);
  mocks.rpc.mockResolvedValue({ data: { syncs: [syncs[0]] }, error: null });
  mocks.dispatch.mockResolvedValue({ mode: "inline" });
  await recoverCatalogueImports({ revision: 2, resume: false });
  expect(mocks.rpc).toHaveBeenCalledWith("resume_catalogue_provider", {
    p_expected_revision: 2,
    p_resume: false,
    p_limit: 1,
  });
  expect(mocks.inline).toHaveBeenCalledWith({
    syncId: "first",
    signal: expect.any(AbortSignal),
  });
});
test("stops dispatching after a queue error and returns the durable recovery state", async () => {
  mocks.dispatch.mockRejectedValue(new Error("Queue unavailable."));
  expect(
    await recoverCatalogueImports({ revision: 1, resume: true }),
  ).toMatchObject({ dispatched: 0, dispatchError: "Queue unavailable." });
  expect(mocks.dispatch).toHaveBeenCalledTimes(1);
});
test("held dispatches are not counted as recovered work", async () => {
  mocks.dispatch.mockResolvedValue({ mode: "held" });
  expect(
    await recoverCatalogueImports({ revision: 1, resume: true }),
  ).toMatchObject({ dispatched: 0 });
});
test("permission denial prevents both database recovery and dispatch", async () => {
  mocks.permission.mockResolvedValue(false);
  const result = await POST(
    new Request("http://localhost/api/admin/catalogue-provider", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: JSON.stringify({ revision: 1, resume: true }),
    }),
  );
  expect(result.status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
  await expect(
    recoverCatalogueImports({ revision: 1, resume: true }),
  ).rejects.toThrow("permission");
});
test("invalid revisions or recovery actions cannot reach the database", async () => {
  for (const body of [
    "invalid",
    JSON.stringify({ revision: -1, resume: true }),
    JSON.stringify({ revision: 1.5, resume: true }),
    JSON.stringify({ revision: 1, resume: "yes" }),
  ]) {
    const result = await POST(
      new Request("http://localhost/api/admin/catalogue-provider", {
        method: "POST",
        headers: { Origin: "http://localhost" },
        body,
      }),
    );
    expect(result.status).toBe(400);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
test("fractional or initial dispatch generations from recovery are rejected", async () => {
  for (const generation of [0, -1, 1.5]) {
    mocks.rpc.mockResolvedValue({
      data: { syncs: [{ id: "first", generation }] },
      error: null,
    });
    await expect(
      recoverCatalogueImports({ revision: 1, resume: true }),
    ).rejects.toThrow("recovered sync is invalid");
  }
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
