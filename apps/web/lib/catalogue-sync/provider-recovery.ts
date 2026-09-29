import "server-only";
import { canManageCatalogueOperations } from "../auth/viewer";
import { createClient } from "../supabase/server";
import { loadCatalogueProviderState } from "../coursemap/admin-operations";
import {
  dispatchCatalogueSync,
  processCatalogueSyncInline,
  syncQueueEnabled,
} from "./sync-queue";
import { safeErrorSummary } from "./process-sync";

export async function recoverCatalogueImports(input: {
  revision: number;
  resume: boolean;
}) {
  if (!(await canManageCatalogueOperations()))
    throw new Error("Catalogue sync permission is required.");
  const supabase = await createClient();
  const queued = syncQueueEnabled();
  const { data, error } = await supabase.rpc("resume_catalogue_provider", {
    p_expected_revision: input.revision,
    p_resume: input.resume,
    p_limit: queued ? 10 : 1,
  });
  if (error) throw new Error(error.message);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Array.isArray(data.syncs)
  ) {
    throw new TypeError("The provider recovery result is invalid.");
  }
  let dispatched = 0;
  let dispatchError: string | null = null;
  for (const item of data.syncs) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.id !== "string" ||
      typeof item.generation !== "number" ||
      !Number.isInteger(item.generation) ||
      item.generation < 1
    ) {
      throw new TypeError("The recovered sync is invalid.");
    }
    try {
      const result = await dispatchCatalogueSync({
        syncId: item.id,
        generation: item.generation,
      });
      if (result.mode === "held") continue;
      dispatched += 1;
      if (result.mode === "inline") {
        await processCatalogueSyncInline({
          syncId: item.id,
          signal: AbortSignal.timeout(50_000),
        });
      }
    } catch (error) {
      // A failed dispatch remains paused; other undispatched jobs remain durable.
      dispatchError = safeErrorSummary(error);
      break;
    }
  }
  return {
    dispatched,
    dispatchError,
    state: await loadCatalogueProviderState(),
  };
}
