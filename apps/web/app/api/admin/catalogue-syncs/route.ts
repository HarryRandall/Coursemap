import { after } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/request-origin";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { isCatalogueKind } from "@/lib/catalogue/content";
import { processCatalogueSyncInline } from "@/lib/catalogue-sync/sync-queue";
import { startCatalogueSync } from "@/lib/catalogue-sync/sync-service";
import { publicErrorMessage, UserFacingError } from "@/lib/public-errors";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type StartRequest = { recordId?: unknown; kind?: unknown };

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Creates one record sync. Inline processing continues after the response. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return json(
      { error: "Use the Coursemap admin page for this action." },
      403,
    );
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
    // Refusals from startCatalogueSync are UserFacingErrors and keep their copy.
    return json(
      { error: publicErrorMessage(error, "The sync could not start.") },
      error instanceof UserFacingError ? 400 : 500,
    );
  }
}

/** Stops an unfinished record sync. */
export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request))
    return json(
      { error: "Use the Coursemap admin page for this action." },
      403,
    );
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
  if (error)
    return json(
      {
        error: publicErrorMessage(error, "The sync could not be stopped.", {
          messages: {
            "28000": "Authentication is required.",
            "42501": "Catalogue sync permission is required.",
          },
        }),
      },
      400,
    );
  return json({ cancelled: data });
}

/** Reads one indexed sync row without loading its record or review. */
export async function GET(request: Request) {
  if (!(await canManageCatalogueOperations())) {
    return json({ error: "Catalogue sync permission is required." }, 403);
  }
  const syncId = new URL(request.url).searchParams.get("syncId");
  if (
    !syncId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      syncId,
    )
  ) {
    return json({ error: "A sync identifier is required." }, 400);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_syncs")
    .select("id,status,error_message")
    .eq("id", syncId)
    .maybeSingle();
  if (error)
    return json({ error: "The sync status could not be loaded." }, 500);
  if (!data) return json({ error: "The sync could not be found." }, 404);
  return Response.json(
    {
      sync: {
        id: data.id,
        status: data.status,
        errorMessage: data.error_message,
      },
    },
    {
      headers: { "cache-control": "private, no-store" },
    },
  );
}
