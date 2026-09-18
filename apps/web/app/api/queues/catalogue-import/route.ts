import { createImportQueueConsumer } from "@/lib/catalogue-import/queue";

export const runtime = "nodejs";
// Structure imports wait up to 150 s on the model; the budget leaves room to record the outcome.
export const maxDuration = 300;

export const POST = createImportQueueConsumer();
