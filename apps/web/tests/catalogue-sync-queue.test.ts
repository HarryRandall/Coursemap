import { describe, expect, it } from "vitest";
import {
  createSyncQueueIdempotencyKey,
  createSyncQueueMessage,
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
