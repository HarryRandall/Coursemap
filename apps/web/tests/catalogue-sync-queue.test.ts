import { describe, expect, it, vi } from "vitest";
import {
  SYNC_QUEUE_MAX_CALLBACK_DELIVERIES,
  createSyncQueueIdempotencyKey,
  createSyncQueueMessage,
  handleSyncQueueDelivery,
  parseSyncQueueMessage,
} from "@/lib/catalogue-sync/sync-queue";

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
