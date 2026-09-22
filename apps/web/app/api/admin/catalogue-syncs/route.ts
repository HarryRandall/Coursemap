import { after } from "next/server";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { isCatalogueKind } from "@/lib/catalogue/content";
import { processCatalogueSyncInline } from "@/lib/catalogue-sync/sync-queue";
import { startCatalogueSync } from "@/lib/catalogue-sync/sync-service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type StartRequest = { recordId?: unknown; kind?: unknown };

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Creates one record sync. Inline processing continues after the response. */
export async function POST(request: Request) {
  if (!(await canManageCatalogueOperations())) {
    return json({ error: "Catalogue sync permission is required." }, 403);
  }
  let payload: StartRequest;
  try {
    payload = (await request.json()) as StartRequest;
  } catch {
    return json({ error: "Invalid sync request." }, 400);
  }
  const recordId = Number(payload.recordId);
  if (!Number.isInteger(recordId) || !isCatalogueKind(payload.kind)) {
    return json({ error: "A catalogue record is required." }, 400);
  }
  try {
    const result = await startCatalogueSync({
      recordId,
      trigger: "manual",
      kind: payload.kind,
    });
    if (result.mode === "inline") {
      after(() => processCatalogueSyncInline({ syncId: result.syncId }));
    }
    return json(result);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "The sync could not start.",
      },
      400,
    );
  }
}

/** Stops an unfinished record sync. */
export async function DELETE(request: Request) {
  if (!(await canManageCatalogueOperations())) {
    return json({ error: "Catalogue sync permission is required." }, 403);
  }
  let payload: { syncId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof payload.syncId !== "string") {
    return json({ error: "A sync identifier is required." }, 400);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_catalogue_sync", {
    p_sync_id: payload.syncId,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ cancelled: data });
}
