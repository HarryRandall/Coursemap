import "server-only";
import { canManageCatalogueOperations, getAuthViewer } from "@/lib/auth/viewer";
import { loadImportModelSetting } from "@/lib/admin/settings";
import { createClient } from "@/lib/supabase/server";
import { dispatchCatalogueSync } from "./sync-queue";
import { syncAdapterForKind } from "./process-sync";
import type { CatalogueKind } from "../catalogue/content";

export class CatalogueSyncStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogueSyncStartError";
  }
}

export async function startCatalogueSync({
  recordId,
  trigger,
  requestedBy,
  kind,
}: {
  recordId: number;
  trigger: "manual" | "scheduled";
  requestedBy?: string;
  kind: CatalogueKind;
}) {
  if (!(await canManageCatalogueOperations())) {
    throw new CatalogueSyncStartError("Catalogue sync permission is required.");
  }
  const viewer = await getAuthViewer();
  if (!viewer || (requestedBy && requestedBy !== viewer.id)) {
    throw new CatalogueSyncStartError("Authentication is required.");
  }
  const setting = await loadImportModelSetting();
  if (!setting.model) {
    throw new CatalogueSyncStartError("Choose an extraction model first.");
  }
  const adapter = syncAdapterForKind(kind);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_catalogue_sync", {
    p_record_id: recordId,
    p_trigger: trigger,
    p_requested_model: setting.model,
    p_parser_version: adapter.parserVersion,
    p_prompt_version: adapter.promptVersion,
    p_schema_version: adapter.schemaVersion,
  });
  if (error) throw new CatalogueSyncStartError(error.message);
  const syncId = data as string;
  const dispatch = await dispatchCatalogueSync({ syncId });
  return { syncId, mode: dispatch.mode };
}
