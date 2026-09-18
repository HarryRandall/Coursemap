import { createImportQueueConsumer } from "@/lib/catalogue-import/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = createImportQueueConsumer();
