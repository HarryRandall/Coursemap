import { after } from "next/server";
import { isSameOriginRequest } from "@/lib/auth/request-origin";
import { publicErrorMessage, UserFacingError } from "@/lib/public-errors";
import {
  advanceCourseRun,
  cancelCourseRun,
  createCourseRun,
  parseCourseRunOptions,
  previewCourseRun,
  readCourseRuns,
  readCourseRunItems,
  requireCourseRunAdministrator,
} from "@/lib/catalogue-runs/service";
import { MAX_SCOPE_STRUCTURES } from "@/lib/catalogue-runs/scope";
import {
  importScopeCourseCodes,
  listImportScopeStructures,
} from "@/lib/catalogue-runs/structure-scope";
import { processCatalogueSync } from "@/lib/catalogue-sync/process-sync";
import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import {
  publishSavedCourseRunDrafts,
  setCourseRunAutoPublish,
} from "@/lib/catalogue-runs/publication";

export const runtime = "nodejs";
export const maxDuration = 60;
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
  try {
    const options = parseCourseRunOptions({
      year: Number(new URL(request.url).searchParams.get("year")),
    });
    const params = new URL(request.url).searchParams;
    // Programmes, majors, minors and specialisations that name courses, so
    // an import can be scoped to the courses one of them requires.
    if (params.get("scope") === "structures") {
      return Response.json({
        structures: await listImportScopeStructures(options.year),
      });
    }
    const scopeRecords = params.get("scopeRecords");
    if (scopeRecords !== null) {
      const recordIds = scopeRecords.split(",").map(Number);
      if (
        recordIds.length === 0 ||
        recordIds.length > MAX_SCOPE_STRUCTURES ||
        !recordIds.every((id) => Number.isSafeInteger(id) && id > 0)
      )
        throw new TypeError(
          `Choose between 1 and ${MAX_SCOPE_STRUCTURES} degrees or majors.`,
        );
      return Response.json({
        codes: await importScopeCourseCodes(options.year, recordIds),
      });
    }
    const runId = params.get("runId");
    if (runId) {
      const page = Number(params.get("page") ?? 1);
      if (
        !UUID.test(runId) ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 1000
      )
        throw new TypeError("Choose a valid import results page.");
      if (
        ![
          "",
          "published",
          "review",
          "draft",
          "failed",
          "stopped",
          "pending",
        ].includes(params.get("outcome") ?? "")
      )
        throw new TypeError("Choose a valid course outcome.");
      return Response.json(
        await readCourseRunItems(
          options.year,
          runId,
          page,
          params.get("review") === "true",
          {
            query: (params.get("q") ?? "").trim().slice(0, 200),
            outcome: params.get("outcome") ?? "",
            issue: (params.get("issue") ?? "").slice(0, 4000),
          },
        ),
      );
    }
    const summary = params.get("summary");
    if (summary && !UUID.test(summary))
      throw new TypeError("Choose a valid import run.");
    return Response.json({
      runs: await readCourseRuns(options.year, { runId: summary ?? undefined }),
    });
  } catch (error) {
    // Request validation throws TypeError and the run service throws
    // UserFacingError, both with copy written for the page.
    if (error instanceof TypeError || error instanceof UserFacingError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: publicErrorMessage(error, "Import runs could not be loaded.") },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json(
      { error: "Use the Coursemap admin page for this action." },
      { status: 403 },
    );
  try {
    await requireCourseRunAdministrator();
  } catch {
    return Response.json(
      { error: "Catalogue import permission is required." },
      { status: 403 },
    );
  }
  try {
    const value = (await request.json()) as Record<string, unknown>;
    if (value.action === "preview")
      return Response.json(
        await previewCourseRun(parseCourseRunOptions(value)),
      );
    if (value.action === "create")
      return Response.json(await createCourseRun(parseCourseRunOptions(value)));
    if (typeof value.runId !== "string" || !UUID.test(value.runId))
      throw new TypeError("Choose a valid import run.");
    if (value.action === "auto-publish" || value.action === "publish-drafts") {
      const viewer = await requireCourseRunAdministrator();
      const runId = value.runId;
      if (value.action === "auto-publish") {
        if (typeof value.enabled !== "boolean")
          throw new TypeError("Choose whether to enable auto-publish.");
        const enabled = value.enabled;
        await withSyncDatabaseClient((sql) =>
          setCourseRunAutoPublish(sql, runId, viewer.id, enabled),
        );
        return Response.json({ enabled });
      }
      const afterRecordId = value.afterRecordId ?? 0;
      if (
        typeof afterRecordId !== "number" ||
        !Number.isSafeInteger(afterRecordId) ||
        afterRecordId < 0
      )
        throw new TypeError("Choose a valid publication batch.");
      return Response.json(
        await withSyncDatabaseClient((sql) =>
          publishSavedCourseRunDrafts(sql, runId, viewer.id, afterRecordId),
        ),
      );
    }
    if (value.action === "cancel") {
      await cancelCourseRun(value.runId);
      return Response.json({ cancelled: true });
    }
    if (value.action === "advance") {
      const next = await advanceCourseRun(value.runId);
      if (next?.mode === "inline")
        after(() =>
          processCatalogueSync({ syncId: next.syncId, maxDeliveries: 1 }),
        );
      return Response.json({ dispatched: Boolean(next) });
    }
    throw new TypeError("Choose a supported import action.");
  } catch (error) {
    // Request validation throws TypeError and the run service throws
    // UserFacingError, both with copy written for the page.
    if (error instanceof TypeError || error instanceof UserFacingError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: publicErrorMessage(error, "The import action failed.") },
      { status: 500 },
    );
  }
}
