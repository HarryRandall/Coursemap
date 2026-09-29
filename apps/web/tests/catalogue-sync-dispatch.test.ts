import { beforeEach, expect, test, vi } from "vitest";
import {
  dispatchCatalogueSync,
  createSyncQueueIdempotencyKey,
  createSyncQueueMessage,
} from "@/lib/catalogue-sync/sync-queue";
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  hold: vi.fn(),
  record: vi.fn(),
  sql: {},
}));
vi.mock("@/lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: (run: (sql: unknown) => unknown) => run(mocks.sql),
  recordSyncDispatch: mocks.record,
}));
vi.mock("@/lib/catalogue-sync/provider-store", () => ({
  catalogueSyncDispatchAllowed: mocks.allowed,
  holdCatalogueSyncAfterDispatchFailure: mocks.hold,
}));
vi.mock("@/lib/catalogue-sync/process-sync", () => ({
  processCatalogueSync: vi.fn(),
  safeErrorSummary: (error: Error) => error.message,
}));
const syncId = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COURSEMAP_QUEUE_SYNCS_ENABLED", "true");
  mocks.allowed.mockResolvedValue(true);
});
test("a resumed sync gets a distinct queue idempotency key and fenced dispatch record", async () => {
  const send = vi.fn().mockResolvedValue({ messageId: "queued" });
  expect(await dispatchCatalogueSync({ syncId, generation: 2, send })).toEqual({
    mode: "queue",
  });
  expect(send).toHaveBeenCalledWith(
    "catalogue-sync-v1",
    { version: 1, syncId },
    expect.objectContaining({
      idempotencyKey: `catalogue-sync:v1:${syncId}:resume:2`,
    }),
  );
  expect(mocks.record).toHaveBeenCalledWith(mocks.sql, {
    syncId,
    generation: 2,
    messageId: "queued",
  });
});
test("held or obsolete generations never reach the queue", async () => {
  mocks.allowed.mockResolvedValue(false);
  const send = vi.fn();
  expect(await dispatchCatalogueSync({ syncId, generation: 1, send })).toEqual({
    mode: "held",
  });
  expect(send).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});
test("a failed redispatch preserves a recoverable paused sync", async () => {
  const send = vi.fn().mockRejectedValue(new Error("Queue unavailable."));
  await expect(
    dispatchCatalogueSync({ syncId, generation: 1, send }),
  ).rejects.toThrow("Queue unavailable.");
  expect(mocks.hold).toHaveBeenCalledWith(mocks.sql, {
    syncId,
    generation: 1,
    errorMessage: "Queue unavailable.",
  });
  expect(mocks.record).not.toHaveBeenCalled();
});
test("invalid dispatch generations cannot create idempotency keys", () => {
  for (const generation of [-1, 1.5, NaN])
    expect(() =>
      createSyncQueueIdempotencyKey(createSyncQueueMessage(syncId), generation),
    ).toThrow("dispatch generation");
});

test("an inline recovery interrupted before worker claim remains undispatched", async () => {
  vi.stubEnv("COURSEMAP_QUEUE_SYNCS_ENABLED", "false");
  const send = vi.fn();
  expect(await dispatchCatalogueSync({ syncId, generation: 1, send })).toEqual({
    mode: "inline",
  });
  expect(send).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});
