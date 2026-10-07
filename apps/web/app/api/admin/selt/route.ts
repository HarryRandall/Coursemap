import { getSiteOriginForRequest } from "@/lib/supabase/config";
import { canWriteCourses } from "@/lib/auth/viewer";
import { requireCourseRunAdministrator } from "@/lib/catalogue-runs/service";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import { createSeltRun, publishSeltReport } from "@/lib/selt/store";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export async function GET(request: Request) {
  try {
    await requireCourseRunAdministrator();
  } catch {
    return Response.json(
      { error: "Catalogue import permission is required." },
      { status: 403 },
    );
  }
  const params = new URL(request.url).searchParams;
  const id = params.get("reportId");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    return Response.json(
      { error: "Choose a valid results page." },
      { status: 400 },
    );
  if (id && !UUID.test(id))
    return Response.json({ error: "Choose a valid report." }, { status: 400 });
  try {
    const result = await withSyncDatabaseClient(async (sql) => {
      if (id)
        return {
          surveys:
            await sql`select * from public.selt_surveys where report_id = ${id} order by year, session`,
        };
      const [runs, reports] = await Promise.all([
        sql`select r.id, r.created_at, r.expires_at, r.revoked_at, count(p.id)::integer as reports from public.selt_import_runs r left join public.selt_reports p on p.import_run_id = r.id group by r.id order by r.created_at desc limit 30`,
        sql`select r.id, c.code, r.course_name, r.created_at, r.published_at, r.warnings, r.notes, r.source_url, r.source_sha256, r.report_run_at, count(s.report_id)::integer as periods from public.selt_reports r join public.catalogue_codes c on c.id = r.code_id left join public.selt_surveys s on s.report_id = r.id group by r.id, c.code order by r.created_at desc, r.id limit 101 offset ${(page - 1) * 100}`,
      ]);
      return {
        runs,
        reports: reports.slice(0, 100),
        hasNext: reports.length > 100,
      };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "SELT reports could not be loaded." },
      { status: 500 },
    );
  }
}
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
