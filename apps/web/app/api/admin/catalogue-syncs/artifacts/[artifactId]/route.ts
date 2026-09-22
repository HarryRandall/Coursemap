import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import {
  type SyncArtifactLocator,
  readSyncArtifact,
} from "@/lib/catalogue-sync/artifact-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Serves a stored sync artefact as inert text for the operations viewer. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  if (!(await canManageCatalogueOperations())) {
    return new Response("Catalogue operations permission is required.", {
      status: 403,
    });
  }
  const { artifactId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_sync_artifacts")
    .select("media_type,content_sha256,byte_size,storage_bucket,storage_path")
    .eq("id", artifactId)
    .maybeSingle();
  if (error || !data)
    return new Response("Artefact not found.", { status: 404 });
  try {
    const body = await readSyncArtifact({
      artifact: {
        bucket: data.storage_bucket as SyncArtifactLocator["bucket"],
        path: data.storage_path,
        mediaType: data.media_type,
        contentSha256: data.content_sha256,
        byteSize: data.byte_size,
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("The artefact could not be read.", { status: 502 });
  }
}
