import { canManageCourseImports } from "@/lib/auth/viewer";
import {
  type ImportArtifactLocator,
  readImportArtifact,
} from "@/lib/catalogue-import/artifact-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Serves a stored artefact as inert text for the admin viewer. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  if (!(await canManageCourseImports())) {
    return new Response("Import permission is required.", { status: 403 });
  }
  const { artifactId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogue_import_artifacts")
    .select("media_type,content_sha256,byte_size,storage_bucket,storage_path")
    .eq("id", artifactId)
    .maybeSingle();
  if (error || !data)
    return new Response("Artefact not found.", { status: 404 });
  try {
    const body = await readImportArtifact({
      artifact: {
        bucket: data.storage_bucket as ImportArtifactLocator["bucket"],
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
