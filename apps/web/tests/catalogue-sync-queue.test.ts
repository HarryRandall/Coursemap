import { describe, expect, it, vi } from "vitest";
import {
  SYNC_QUEUE_MAX_CALLBACK_DELIVERIES,
  createSyncQueueIdempotencyKey,
  createSyncQueueMessage,
  handleSyncQueueDelivery,
  parseSyncQueueMessage,
  processCatalogueSyncInline,
} from "@/lib/catalogue-sync/sync-queue";
import { SyncClaimUnavailableError } from "@/lib/catalogue-sync/process-sync";

const SYNC_ID = "10000000-0000-4000-8000-000000000001";

describe("catalogue sync queue messages", () => {
  it("contains only the independently executable sync identifier", () => {
    expect(createSyncQueueMessage(SYNC_ID)).toEqual({
      version: 1,
      syncId: SYNC_ID,
    });
  });

  it("rejects obsolete run and target identifiers", () => {
    expect(() =>
      parseSyncQueueMessage({
        version: 1,
        syncId: SYNC_ID,
        runId: SYNC_ID,
        targetId: SYNC_ID,
      }),
    ).toThrow("Sync queue message fields do not match version 1.");
  });

  it("uses the sync as the idempotency boundary", () => {
    expect(createSyncQueueIdempotencyKey(createSyncQueueMessage(SYNC_ID))).toBe(
      `catalogue-sync:v1:${SYNC_ID}`,
    );
  });
});

describe("catalogue sync queue deliveries", () => {
  const failure = new Error("The catalogue sync could not be claimed.");

  it("leaves a terminal status before the queue gives up on a sync", async () => {
    const failSync = vi.fn(async () => true);
    const process = vi.fn(async () => {
      throw failure;
    });
    await expect(
      handleSyncQueueDelivery(
        createSyncQueueMessage(SYNC_ID),
        { deliveryCount: SYNC_QUEUE_MAX_CALLBACK_DELIVERIES },
        { process, failSync },
      ),
    ).rejects.toBe(failure);
    expect(failSync).toHaveBeenCalledWith({
      syncId: SYNC_ID,
      errorCode: "QUEUE_EXHAUSTED",
      errorMessage: expect.stringContaining(failure.message),
    });
  });

  it("leaves a sync alone while the queue will deliver it again", async () => {
    const failSync = vi.fn(async () => true);
    await expect(
      handleSyncQueueDelivery(
        createSyncQueueMessage(SYNC_ID),
        { deliveryCount: SYNC_QUEUE_MAX_CALLBACK_DELIVERIES - 1 },
        {
          process: async () => {
            throw failure;
          },
          failSync,
        },
      ),
    ).rejects.toBe(failure);
    expect(failSync).not.toHaveBeenCalled();
  });

  it("fails the sync a rejected message still names instead of dropping it", async () => {
    const failSync = vi.fn(async () => true);
    const process = vi.fn();
    await expect(
      handleSyncQueueDelivery(
        { version: 1, syncId: SYNC_ID, runId: SYNC_ID },
        { deliveryCount: 1 },
        { process, failSync },
      ),
    ).rejects.toThrow("Sync queue message fields do not match version 1.");
    expect(failSync).toHaveBeenCalledWith({
      syncId: SYNC_ID,
      errorCode: "QUEUE_MESSAGE_INVALID",
      errorMessage: "Sync queue message fields do not match version 1.",
    });
    await expect(
      handleSyncQueueDelivery(
        { version: 1, syncId: "not-a-sync" },
        { deliveryCount: 1 },
        { process, failSync },
      ),
    ).rejects.toThrow("Sync queue syncId must be a UUID.");
    expect(failSync).toHaveBeenCalledTimes(1);
    expect(process).not.toHaveBeenCalled();
  });
});

describe("inline catalogue sync processing", () => {
  it("backs off between attempts like queue redelivery", async () => {
    vi.useFakeTimers();
    try {
      const process = vi
        .fn()
        .mockRejectedValueOnce(new Error("ANU is unavailable."))
        .mockRejectedValueOnce(new Error("ANU is unavailable."))
        .mockResolvedValueOnce(undefined);
      const done = processCatalogueSyncInline({
        syncId: SYNC_ID,
        process,
        retryDelayMs: 100,
      });
      await vi.advanceTimersByTimeAsync(99);
      expect(process).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(process).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(process).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(process).toHaveBeenCalledTimes(3);
      expect(process.mock.calls.map(([input]) => input.deliveryCount)).toEqual([
        1, 2, 3,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when another worker holds the sync", async () => {
    const process = vi.fn().mockRejectedValue(new SyncClaimUnavailableError());
    await processCatalogueSyncInline({
      syncId: SYNC_ID,
      process,
      retryDelayMs: 0,
    });
    expect(process).toHaveBeenCalledTimes(1);
  });
});
