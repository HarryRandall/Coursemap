import { isSameOriginRequest } from "@/lib/auth/request-origin";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { recoverCatalogueImports } from "@/lib/catalogue-sync/provider-recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json(
      { error: "Use the Coursemap admin page for this action." },
      { status: 403 },
    );
  if (!(await canManageCatalogueOperations()))
    return Response.json(
      { error: "Catalogue sync permission is required." },
      { status: 403 },
    );
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid recovery request." },
      { status: 400 },
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("revision" in payload) ||
    !("resume" in payload) ||
    typeof payload.revision !== "number" ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 0 ||
    typeof payload.resume !== "boolean"
  ) {
    return Response.json(
      { error: "The provider revision and recovery action are required." },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await recoverCatalogueImports({
        revision: payload.revision,
        resume: payload.resume,
      }),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The imports could not be resumed.",
      },
      { status: 400 },
    );
  }
}
