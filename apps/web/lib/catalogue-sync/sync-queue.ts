import type { MessageMetadata, RetryDirective } from "@vercel/queue";
import { recordSyncDispatch, withSyncDatabaseClient } from "./sync-store.ts";
import {
  processCatalogueSync,
  type ProcessCatalogueSyncInput,
} from "./process-sync.ts";

export const SYNC_QUEUE_TOPIC = "catalogue-sync-v1";
export const SYNC_QUEUE_MESSAGE_VERSION = 1 as const;
export const SYNC_QUEUE_RETENTION_SECONDS = 24 * 60 * 60;
export const SYNC_QUEUE_MAX_DELIVERIES = 5;
export const SYNC_QUEUE_MAX_CALLBACK_DELIVERIES = 12;
export const SYNC_QUEUE_VISIBILITY_TIMEOUT_SECONDS = 600;
export const SYNC_QUEUE_DELIVERY_BUDGET_MS = 290_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SyncQueueMessage = {
  version: typeof SYNC_QUEUE_MESSAGE_VERSION;
  syncId: string;
};

export class SyncQueueMessageError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "SyncQueueMessageError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSyncQueueMessage(value: unknown): SyncQueueMessage {
  if (!isRecord(value)) {
    throw new SyncQueueMessageError("Sync queue messages must be objects.");
  }
  if (Object.keys(value).sort().join(",") !== "syncId,version") {
    throw new SyncQueueMessageError(
      "Sync queue message fields do not match version 1.",
    );
  }
  if (value.version !== SYNC_QUEUE_MESSAGE_VERSION) {
    throw new SyncQueueMessageError("Unsupported sync queue message version.");
  }
  if (typeof value.syncId !== "string" || !UUID_PATTERN.test(value.syncId)) {
    throw new SyncQueueMessageError("Sync queue syncId must be a UUID.");
  }
  return {
    version: SYNC_QUEUE_MESSAGE_VERSION,
    syncId: value.syncId,
  };
}

export function createSyncQueueMessage(syncId: string) {
  return parseSyncQueueMessage({
    version: SYNC_QUEUE_MESSAGE_VERSION,
    syncId,
  });
}

export function createSyncQueueIdempotencyKey(message: SyncQueueMessage) {
  return `catalogue-sync:v${message.version}:${message.syncId}`;
}

/** Only the exact value "true" publishes to Vercel Queues. */
export function syncQueueEnabled(
  value = process.env.COURSEMAP_QUEUE_SYNCS_ENABLED,
) {
  return value === "true";
}

export type SyncQueueSend = (
  topic: string,
  message: SyncQueueMessage,
  options: { idempotencyKey: string; retentionSeconds: number },
) => Promise<{ messageId: string | null }>;

async function sendWithVercelQueue(
  topic: string,
  message: SyncQueueMessage,
  options: { idempotencyKey: string; retentionSeconds: number },
) {
  // The queue SDK is loaded only when publishing so Next.js page collection
  // never constructs its region-aware client.
  const { send } = await import("@vercel/queue");
  return send(topic, message, options);
}

export async function dispatchCatalogueSync({
  syncId,
  send = sendWithVercelQueue,
}: {
  syncId: string;
  send?: SyncQueueSend;
}) {
  if (syncQueueEnabled()) {
    const message = createSyncQueueMessage(syncId);
    try {
      const result = await send(SYNC_QUEUE_TOPIC, message, {
        idempotencyKey: createSyncQueueIdempotencyKey(message),
        retentionSeconds: SYNC_QUEUE_RETENTION_SECONDS,
      });
      await withSyncDatabaseClient((sql) =>
        recordSyncDispatch(sql, { syncId, messageId: result.messageId }),
      );
      return { mode: "queue" as const };
    } catch (error) {
      await withSyncDatabaseClient((sql) =>
        recordSyncDispatch(sql, {
          syncId,
          messageId: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : "The queue did not accept this sync.",
        }),
      );
      throw error;
    }
  }
  await withSyncDatabaseClient((sql) =>
    recordSyncDispatch(sql, { syncId, messageId: null }),
  );
  return { mode: "inline" as const };
}

export async function processCatalogueSyncInline({
  syncId,
  process = processCatalogueSync,
  signal,
}: {
  syncId: string;
  process?: (input: ProcessCatalogueSyncInput) => Promise<void>;
  signal?: AbortSignal;
}) {
  for (
    let deliveryCount = 1;
    deliveryCount <= SYNC_QUEUE_MAX_DELIVERIES;
    deliveryCount += 1
  ) {
    signal?.throwIfAborted();
    try {
      await process({
        syncId,
        deliveryCount,
        maxDeliveries: SYNC_QUEUE_MAX_DELIVERIES,
        signal,
      });
      return;
    } catch {
      if (deliveryCount === SYNC_QUEUE_MAX_DELIVERIES) return;
    }
  }
}

function retrySyncQueueMessage(
  error: unknown,
  metadata: MessageMetadata,
): RetryDirective {
  if (error instanceof SyncQueueMessageError) return { acknowledge: true };
  if (metadata.deliveryCount >= SYNC_QUEUE_MAX_CALLBACK_DELIVERIES) {
    return { acknowledge: true };
  }
  return { afterSeconds: Math.min(300, 5 * 2 ** (metadata.deliveryCount - 1)) };
}

export const syncQueueInternals = { retrySyncQueueMessage };

export function createSyncQueueConsumer(
  process: (
    input: ProcessCatalogueSyncInput,
  ) => void | Promise<void> = processCatalogueSync,
) {
  return async (request: Request) => {
    const { handleCallback } = await import("@vercel/queue");
    const consume = handleCallback<unknown>(
      async (value, metadata) => {
        const message = parseSyncQueueMessage(value);
        await process({
          syncId: message.syncId,
          deliveryCount: metadata.deliveryCount,
          maxDeliveries: SYNC_QUEUE_MAX_DELIVERIES,
          signal: AbortSignal.timeout(SYNC_QUEUE_DELIVERY_BUDGET_MS),
        });
      },
      {
        visibilityTimeoutSeconds: SYNC_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
        retry: retrySyncQueueMessage,
      },
    );
    return consume(request);
  };
}
