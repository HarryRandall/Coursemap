import { UserFacingError } from "@/lib/public-errors";
import { createClient } from "@/lib/supabase/server";
import type { ImportModel } from "@/lib/admin/import-model";

export const IMPORT_MODEL_SETTING_KEY = "imports.model";
export type ImportModelSetting = {
  model: string;
  options: string[];
  models: ImportModel[];
  configured: boolean;
  updatedAt: string | null;
  error: string | null;
};

export async function loadImportModelSetting(): Promise<ImportModelSetting> {
  const empty: ImportModelSetting = {
    model: "",
    options: [],
    models: [],
    configured: false,
    updatedAt: null,
    error: null,
  };
  try {
    const supabase = await createClient();
    const [catalogue, setting] = await Promise.all([
      supabase
        .from("import_models")
        .select("*")
        .eq("enabled", true)
        .order("provider")
        .order("name"),
      supabase
        .from("app_settings")
        .select("value,updated_at")
        .eq("key", IMPORT_MODEL_SETTING_KEY)
        .maybeSingle(),
    ]);
    if (catalogue.error || setting.error)
      throw new UserFacingError("The import models could not be loaded.");
    const models = catalogue.data ?? [];
    const options = models
      .filter((model) => model.visible)
      .map((model) => model.id);
    const stored =
      typeof setting.data?.value === "string" ? setting.data.value : "";
    const configured = options.includes(stored);
    return {
      model: configured ? stored : (options[0] ?? ""),
      options,
      models,
      configured,
      updatedAt: setting.data?.updated_at ?? null,
      error: null,
    };
  } catch {
    return { ...empty, error: "The import models could not be loaded." };
  }
}
