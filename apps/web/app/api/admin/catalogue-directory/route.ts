import { canManageCatalogueSources } from "@/lib/auth/viewer";
import { refreshCatalogueDirectory } from "@/lib/catalogue-import/directory";
import { isCatalogueKind } from "@/lib/catalogue/content";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

function event(data: unknown) {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function eventResponse(data: unknown, status: number) {
  return new Response(event(data), {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Streams directory refresh progress as server-sent events. */
export async function POST(request: Request) {
  if (!(await canManageCatalogueSources())) {
    return eventResponse(
      { type: "error", message: "Import permission is required." },
      403,
    );
  }
  let payload: { kind?: unknown; academicYear?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return eventResponse(
      { type: "error", message: "Invalid directory request." },
      400,
    );
  }
  const kind = payload.kind;
  const academicYear = Number(payload.academicYear);
  if (!isCatalogueKind(kind)) {
    return eventResponse(
      { type: "error", message: "The catalogue kind is not recognised." },
      400,
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(event(data));
      try {
        send({ type: "started" });
        const result = await refreshCatalogueDirectory({
          kind,
          academicYear,
          onProgress: (progress) => send({ type: "progress", ...progress }),
          signal: request.signal,
        });
        send({ type: "complete", result });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "The directory refresh failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    },
  });
}
