import type { MessageMetadata, RetryDirective } from "@vercel/queue";
import {
  listQueuedTargetIds,
  recordImportDispatch,
  withImportDatabaseClient,
} from "./import-store.ts";
import {
  processImportTarget,
  type ProcessImportTargetInput,
} from "./process-target.ts";

export const IMPORT_QUEUE_TOPIC = "catalogue-import-v1";
export const IMPORT_QUEUE_MESSAGE_VERSION = 1 as const;
export const IMPORT_QUEUE_RETENTION_SECONDS = 24 * 60 * 60;
export const IMPORT_QUEUE_MAX_DELIVERIES = 5;
export const IMPORT_QUEUE_MAX_CALLBACK_DELIVERIES = 12;
export const IMPORT_QUEUE_VISIBILITY_TIMEOUT_SECONDS = 600;
export const IMPORT_QUEUE_DELIVERY_BUDGET_MS = 55_000;
export const MAX_TARGETS_PER_IMPORT_RUN = 10;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ImportQueueMessage = {
  version: typeof IMPORT_QUEUE_MESSAGE_VERSION;
  runId: string;
  targetId: string;
};

export class ImportQueueMessageError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ImportQueueMessageError";
  }
}

export class ImportQueueDispatchError extends Error {
  readonly dispatched: Array<{ targetId: string; messageId: string | null }>;
  readonly failedTargetIds: readonly string[];

  constructor({
    dispatched,
    failedTargetIds,
  }: {
    dispatched: Array<{ targetId: string; messageId: string | null }>;
    failedTargetIds: readonly string[];
  }) {
    super(
      `Queued ${dispatched.length} import target${dispatched.length === 1 ? "" : "s"}; ${failedTargetIds.length} could not be queued.`,
    );
    this.name = "ImportQueueDispatchError";
    this.dispatched = dispatched;
    this.failedTargetIds = failedTargetIds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseImportQueueMessage(value: unknown): ImportQueueMessage {
  if (!isRecord(value)) {
    throw new ImportQueueMessageError("Import queue messages must be objects.");
  }
  if (Object.keys(value).sort().join(",") !== "runId,targetId,version") {
    throw new ImportQueueMessageError(
      "Import queue message fields do not match version 1.",
    );
  }
  if (value.version !== IMPORT_QUEUE_MESSAGE_VERSION) {
    throw new ImportQueueMessageError(
      "Unsupported import queue message version.",
    );
  }
  if (typeof value.runId !== "string" || !UUID_PATTERN.test(value.runId)) {
    throw new ImportQueueMessageError("Import queue runId must be a UUID.");
  }
  if (
    typeof value.targetId !== "string" ||
    !UUID_PATTERN.test(value.targetId)
  ) {
    throw new ImportQueueMessageError("Import queue targetId must be a UUID.");
  }
  return {
    version: IMPORT_QUEUE_MESSAGE_VERSION,
    runId: value.runId,
    targetId: value.targetId,
  };
}

export function createImportQueueMessage(input: {
  runId: string;
  targetId: string;
}) {
  return parseImportQueueMessage({
    version: IMPORT_QUEUE_MESSAGE_VERSION,
    ...input,
  });
}

export function createImportQueueIdempotencyKey(message: ImportQueueMessage) {
  return `catalogue-import:v${message.version}:${message.runId}:${message.targetId}`;
}

/** Only the exact value "true" publishes to Vercel Queues. */
export function importQueueEnabled(
  value = process.env.COURSEMAP_QUEUE_IMPORTS_ENABLED,
) {
  return value === "true";
}

export type ImportQueueSend = (
  topic: string,
  message: ImportQueueMessage,
  options: { idempotencyKey: string; retentionSeconds: number },
) => Promise<{ messageId: string | null }>;

async function sendWithVercelQueue(
  topic: string,
  message: ImportQueueMessage,
  options: { idempotencyKey: string; retentionSeconds: number },
) {
  // The queue SDK is loaded only when publishing so Next.js page collection
  // never constructs its region-aware client.
  const { send } = await import("@vercel/queue");
  return send(topic, message, options);
}

export async function enqueueImportTargets(
  { runId, targetIds }: { runId: string; targetIds: readonly string[] },
  send: ImportQueueSend = sendWithVercelQueue,
) {
  if (targetIds.length === 0 || targetIds.length > MAX_TARGETS_PER_IMPORT_RUN) {
    throw new RangeError(
      `An import run must contain 1 to ${MAX_TARGETS_PER_IMPORT_RUN} targets.`,
    );
  }
  if (new Set(targetIds).size !== targetIds.length) {
    throw new TypeError("An import target may only be queued once.");
  }
  const messages = targetIds.map((targetId) =>
    createImportQueueMessage({ runId, targetId }),
  );
  const results = await Promise.allSettled(
    messages.map(async (message) => {
      const result = await send(IMPORT_QUEUE_TOPIC, message, {
        idempotencyKey: createImportQueueIdempotencyKey(message),
        retentionSeconds: IMPORT_QUEUE_RETENTION_SECONDS,
      });
      return { targetId: message.targetId, messageId: result.messageId };
    }),
  );
  const dispatched = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failedTargetIds = results.flatMap((result, index) =>
    result.status === "rejected" ? [messages[index]!.targetId] : [],
  );
  if (failedTargetIds.length > 0) {
    throw new ImportQueueDispatchError({ dispatched, failedTargetIds });
  }
  return dispatched;
}

/**
 * Starts processing for a run's queued targets. With the queue enabled each
 * target becomes a message; otherwise the targets run in this process one
 * after another, which is how development and tests complete an import.
 */
export async function dispatchImportRun({
  runId,
  targetIds,
  send,
  process = processImportTarget,
}: {
  runId: string;
  targetIds: readonly string[];
  send?: ImportQueueSend;
  process?: (input: ProcessImportTargetInput) => Promise<void>;
}) {
  if (importQueueEnabled()) {
    try {
      const dispatched = await enqueueImportTargets({ runId, targetIds }, send);
      await withImportDatabaseClient((sql) =>
        recordImportDispatch(sql, { runId, dispatched, failedTargetIds: [] }),
      );
      return { mode: "queue" as const, dispatched: dispatched.length };
    } catch (error) {
      if (error instanceof ImportQueueDispatchError) {
        await withImportDatabaseClient((sql) =>
          recordImportDispatch(sql, {
            runId,
            dispatched: error.dispatched,
            failedTargetIds: error.failedTargetIds,
          }),
        );
      }
      throw error;
    }
  }

  await withImportDatabaseClient((sql) =>
    recordImportDispatch(sql, {
      runId,
      dispatched: targetIds.map((targetId) => ({ targetId, messageId: null })),
      failedTargetIds: [],
    }),
  );
  return { mode: "inline" as const, dispatched: targetIds.length };
}

/**
 * Processes every queued target of a run in this process. A retryable failure
 * leaves the target queued and continues with the next one; repeated passes
 * give each target up to its attempt limit.
 */
export async function processImportRunInline({
  runId,
  process = processImportTarget,
  signal,
}: {
  runId: string;
  process?: (input: ProcessImportTargetInput) => Promise<void>;
  signal?: AbortSignal;
}) {
  let completed = 0;
  for (let pass = 1; pass <= IMPORT_QUEUE_MAX_DELIVERIES; pass += 1) {
    const queued = await withImportDatabaseClient((sql) =>
      listQueuedTargetIds(sql, runId),
    );
    if (queued.length === 0) break;
    for (const targetId of queued) {
      signal?.throwIfAborted();
      try {
        await process({
          runId,
          targetId,
          deliveryCount: pass,
          maxDeliveries: IMPORT_QUEUE_MAX_DELIVERIES,
          signal,
        });
        completed += 1;
      } catch {
        // The processor already recorded the failure or requeued the target.
      }
    }
  }
  return { completed };
}

function retryImportQueueMessage(
  error: unknown,
  metadata: MessageMetadata,
): RetryDirective {
  if (error instanceof ImportQueueMessageError) return { acknowledge: true };
  if (metadata.deliveryCount >= IMPORT_QUEUE_MAX_CALLBACK_DELIVERIES) {
    return { acknowledge: true };
  }
  return { afterSeconds: Math.min(300, 5 * 2 ** (metadata.deliveryCount - 1)) };
}

export const importQueueInternals = { retryImportQueueMessage };

export function createImportQueueConsumer(
  process: (
    input: ProcessImportTargetInput,
  ) => void | Promise<void> = processImportTarget,
) {
  return async (request: Request) => {
    const { handleCallback } = await import("@vercel/queue");
    const consume = handleCallback<unknown>(
      async (value, metadata) => {
        const message = parseImportQueueMessage(value);
        await process({
          runId: message.runId,
          targetId: message.targetId,
          deliveryCount: metadata.deliveryCount,
          maxDeliveries: IMPORT_QUEUE_MAX_DELIVERIES,
          signal: AbortSignal.timeout(IMPORT_QUEUE_DELIVERY_BUDGET_MS),
        });
      },
      {
        visibilityTimeoutSeconds: IMPORT_QUEUE_VISIBILITY_TIMEOUT_SECONDS,
        retry: retryImportQueueMessage,
      },
    );
    return consume(request);
  };
}
