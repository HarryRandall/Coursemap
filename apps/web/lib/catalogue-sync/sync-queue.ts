import type { MessageMetadata, RetryDirective } from "@vercel/queue";
import {
  failAbandonedCatalogueSync,
  recordSyncDispatch,
  withSyncDatabaseClient,
} from "./sync-store.ts";
import {
  catalogueSyncDispatchAllowed,
  holdCatalogueSyncAfterDispatchFailure,
} from "./provider-store.ts";
import {
  SyncClaimUnavailableError,
  processCatalogueSync,
  safeErrorSummary,
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

export function createSyncQueueIdempotencyKey(
  message: SyncQueueMessage,
  generation = 0,
) {
  if (!Number.isInteger(generation) || generation < 0)
    throw new TypeError("The dispatch generation is invalid.");
  const key = `catalogue-sync:v${message.version}:${message.syncId}`;
  return generation === 0 ? key : `${key}:resume:${generation}`;
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
  generation = 0,
  send = sendWithVercelQueue,
}: {
  syncId: string;
  generation?: number;
  send?: SyncQueueSend;
}) {
  if (
    !(await withSyncDatabaseClient((sql) =>
      catalogueSyncDispatchAllowed(sql, { syncId, generation }),
    ))
  ) {
    return { mode: "held" as const };
  }
  if (syncQueueEnabled()) {
    const message = createSyncQueueMessage(syncId);
    try {
      const result = await send(SYNC_QUEUE_TOPIC, message, {
        idempotencyKey: createSyncQueueIdempotencyKey(message, generation),
        retentionSeconds: SYNC_QUEUE_RETENTION_SECONDS,
      });
      await withSyncDatabaseClient((sql) =>
        recordSyncDispatch(sql, {
          syncId,
          messageId: result.messageId,
          generation,
        }),
      );
      return { mode: "queue" as const };
    } catch (error) {
      if (generation > 0) {
        await withSyncDatabaseClient((sql) =>
          holdCatalogueSyncAfterDispatchFailure(sql, {
            syncId,
            generation,
            errorMessage: safeErrorSummary(error),
          }),
        );
        throw error;
      }
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
  // A resumed inline job stays recoverable until the worker actually claims it.
  if (generation === 0) {
    await withSyncDatabaseClient((sql) =>
      recordSyncDispatch(sql, { syncId, messageId: null, generation }),
    );
  }
  return { mode: "inline" as const };
}

function waitBeforeRetry(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Processes a sync in this process with the queue's delivery budget. Attempts
 * back off exponentially from `retryDelayMs`, and stop once another worker
 * holds the sync or it can no longer be claimed.
 */
export async function processCatalogueSyncInline({
  syncId,
  process = processCatalogueSync,
  signal,
  retryDelayMs = 1_000,
}: {
  syncId: string;
  process?: (input: ProcessCatalogueSyncInput) => Promise<void>;
  signal?: AbortSignal;
  retryDelayMs?: number;
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
    } catch (error) {
      if (
        error instanceof SyncClaimUnavailableError ||
        deliveryCount === SYNC_QUEUE_MAX_DELIVERIES
      )
        return;
    }
    await waitBeforeRetry(retryDelayMs * 2 ** (deliveryCount - 1), signal);
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

type SyncQueueDeliveryDependencies = {
  process: (input: ProcessCatalogueSyncInput) => void | Promise<void>;
  failSync: (input: {
    syncId: string;
    errorCode: string;
    errorMessage: string;
  }) => Promise<unknown>;
};

function failAbandonedSync(input: {
  syncId: string;
  errorCode: string;
  errorMessage: string;
}) {
  return withSyncDatabaseClient((sql) =>
    failAbandonedCatalogueSync(sql, input),
  );
}

/** The sync a rejected message still names, when it names one. */
function syncIdFromRejectedMessage(value: unknown) {
  return isRecord(value) &&
    typeof value.syncId === "string" &&
    UUID_PATTERN.test(value.syncId)
    ? value.syncId
    : null;
}

/**
 * Processes one queue delivery. A message the queue is about to acknowledge
 * without success leaves a terminal status first, so its sync never stays
 * queued or running with nothing left to deliver it. The original error is
 * rethrown for the retry policy.
 */
export async function handleSyncQueueDelivery(
  value: unknown,
  metadata: Pick<MessageMetadata, "deliveryCount">,
  {
    process = processCatalogueSync,
    failSync = failAbandonedSync,
  }: Partial<SyncQueueDeliveryDependencies> = {},
) {
  let message: SyncQueueMessage;
  try {
    message = parseSyncQueueMessage(value);
  } catch (error) {
    const syncId = syncIdFromRejectedMessage(value);
    if (syncId)
      await failSync({
        syncId,
        errorCode: "QUEUE_MESSAGE_INVALID",
        errorMessage: safeErrorSummary(error),
      });
    throw error;
  }
  try {
    await process({
      syncId: message.syncId,
      deliveryCount: metadata.deliveryCount,
      maxDeliveries: SYNC_QUEUE_MAX_DELIVERIES,
      signal: AbortSignal.timeout(SYNC_QUEUE_DELIVERY_BUDGET_MS),
    });
  } catch (error) {
    if (metadata.deliveryCount >= SYNC_QUEUE_MAX_CALLBACK_DELIVERIES)
      await failSync({
        syncId: message.syncId,
        errorCode: "QUEUE_EXHAUSTED",
        errorMessage: `The queue stopped delivering this sync after ${metadata.deliveryCount} attempts. ${safeErrorSummary(error)}`,
      });
    throw error;
  }
}

export function createSyncQueueConsumer(
  process: (
    input: ProcessCatalogueSyncInput,
  ) => void | Promise<void> = processCatalogueSync,
) {
  return async (request: Request) => {
    const { handleCallback } = await import("@vercel/queue");
    const consume = handleCallback<unknown>(
      (value, metadata) =>
        handleSyncQueueDelivery(value, metadata, { process }),
      {
        visibilityTimeoutSeconds: SYNC_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
        retry: retrySyncQueueMessage,
      },
    );
    return consume(request);
  };
}
