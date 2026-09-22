import { createSyncQueueConsumer } from "@/lib/catalogue-sync/sync-queue";

export const runtime = "nodejs";
// Structure syncs wait up to 150 s on the model; the budget leaves room to record the outcome.
export const maxDuration = 300;

export const POST = createSyncQueueConsumer();
