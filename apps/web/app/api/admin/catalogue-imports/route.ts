import { after } from "next/server";
import { canManageCourseImports } from "@/lib/auth/viewer";
import {
  dispatchImportRun,
  processImportRunInline,
} from "@/lib/catalogue-import/queue";
import { adapterForKind } from "@/lib/catalogue-import/process-target";
import { isCatalogueKind } from "@/lib/catalogue/content";
import { loadImportModelSetting } from "@/lib/admin/settings";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type StartRequest = {
  kind?: unknown;
  academicYear?: unknown;
  codes?: unknown;
  requestedModel?: unknown;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

/** Creates a run and starts processing. Inline runs continue after the response. */
export async function POST(request: Request) {
  if (!(await canManageCourseImports())) {
    return json({ error: "Import permission is required." }, 403);
  }
  let payload: StartRequest;
  try {
    payload = (await request.json()) as StartRequest;
  } catch {
    return json({ error: "Invalid import request." }, 400);
  }
  const kind = payload.kind;
  if (!isCatalogueKind(kind)) {
    return json({ error: "The catalogue kind is not recognised." }, 400);
  }
  const academicYear = Number(payload.academicYear);
  if (!Number.isInteger(academicYear)) {
    return json({ error: "The academic year is required." }, 400);
  }
  const codes = Array.isArray(payload.codes)
    ? payload.codes.filter((code): code is string => typeof code === "string")
    : [];
  if (codes.length === 0) {
    return json({ error: "Select at least one record to import." }, 400);
  }
  const setting = await loadImportModelSetting();
  const requestedModel =
    typeof payload.requestedModel === "string" && payload.requestedModel.trim()
      ? payload.requestedModel.trim()
      : setting.model;
  if (!requestedModel) {
    return json({ error: "Choose an import model first." }, 400);
  }

  const adapter = adapterForKind(kind);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_catalogue_import", {
    p_academic_year: academicYear,
    p_kind: kind,
    p_codes: codes,
    p_requested_model: requestedModel,
    p_parser_version: adapter.parserVersion,
    p_prompt_version: adapter.promptVersion,
    p_schema_version: adapter.schemaVersion,
  });
  if (error) return json({ error: error.message }, 400);
  const run = data as { runId: string; targets: Array<{ targetId: string }> };
  const targetIds = run.targets.map((target) => target.targetId);

  const dispatch = await dispatchImportRun({ runId: run.runId, targetIds });
  if (dispatch.mode === "inline") {
    after(() => processImportRunInline({ runId: run.runId }));
  }
  return json({
    runId: run.runId,
    targets: targetIds.length,
    mode: dispatch.mode,
  });
}

/** Stops a run's unfinished targets. */
export async function DELETE(request: Request) {
  if (!(await canManageCourseImports())) {
    return json({ error: "Import permission is required." }, 403);
  }
  let payload: { runId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof payload.runId !== "string") {
    return json({ error: "A run identifier is required." }, 400);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_catalogue_import", {
    p_run_id: payload.runId,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ cancelled: data });
}
