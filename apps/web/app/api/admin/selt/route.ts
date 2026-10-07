import { getSiteOriginForRequest } from "@/lib/supabase/config";
import { canWriteCourses } from "@/lib/auth/viewer";
import { requireCourseRunAdministrator } from "@/lib/catalogue-runs/service";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import { createSeltRun, publishSeltReport } from "@/lib/selt/store";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await requireCourseRunAdministrator();
  } catch {
    return Response.json(
      { error: "Catalogue import permission is required." },
      { status: 403 },
    );
  }
  // Cookie-authenticated mutations must originate from the same application.
  const siteOrigin = getSiteOriginForRequest(
    new URL(request.url),
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  if (!siteOrigin || request.headers.get("origin") !== siteOrigin)
    return Response.json(
      { error: "Use the Coursemap admin page for this action." },
      { status: 403 },
    );
  try {
    const value = await request.json();
    if (value.action === "create") {
      const run = await withSyncDatabaseClient((sql) =>
        createSeltRun(sql, viewer.id),
      );
      return Response.json(run, { headers: { "Cache-Control": "no-store" } });
    }
    if (typeof value.id !== "string" || !UUID.test(value.id))
      throw new TypeError("Choose a valid report or import.");
    const id: string = value.id;
    if (value.action === "revoke") {
      await withSyncDatabaseClient(
        (sql) =>
          sql`update public.selt_import_runs set revoked_at = now() where id = ${id}`,
      );
    } else if (value.action === "publish") {
      if (!(await canWriteCourses()))
        return Response.json(
          { error: "Course publication permission is required." },
          { status: 403 },
        );
      await withSyncDatabaseClient((sql) =>
        publishSeltReport(sql, id, viewer.id),
      );
    } else throw new TypeError("Choose a supported SELT action.");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof TypeError
            ? error.message
            : "The SELT action failed.",
      },
      { status: 400 },
    );
  }
}
