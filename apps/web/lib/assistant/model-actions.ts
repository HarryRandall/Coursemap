"use server";

import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { loadImportModelSetting } from "@/lib/admin/settings";
import type { ImportModel } from "@/lib/admin/import-model";

export async function loadAssistantModels(): Promise<{
  models: ImportModel[];
  defaultModel: string;
  error: string | null;
}> {
  if (!(await canManageCatalogueOperations())) {
    return {
      models: [],
      defaultModel: "",
      error: "Model access requires import management permission.",
    };
  }
  const settings = await loadImportModelSetting();
  return {
    models: settings.models.filter((model) => model.enabled && model.visible),
    defaultModel: settings.model,
    error: settings.error,
  };
}
