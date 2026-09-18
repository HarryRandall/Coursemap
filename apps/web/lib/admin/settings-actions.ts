"use server";

import { revalidatePath } from "next/cache";
import { canManageCourseImports } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { IMPORT_MODEL_SETTING_KEY } from "@/lib/admin/settings";
import { fetchCatalogueModel } from "@/lib/admin/model-catalogue";
import { assertOpenRouterModel } from "@/lib/catalogue-import/openrouter";

export type ImportModelActionResult = {
  ok: boolean;
  model: string;
  message: string;
};

function refreshImportPages() {
  revalidatePath("/admin", "layout");
}

export async function setImportModel(
  model: string,
): Promise<ImportModelActionResult> {
  if (!(await canManageCourseImports()))
    return {
      ok: false,
      model,
      message: "Import management permission is required.",
    };
  try {
    const requested = assertOpenRouterModel(model);
    const supabase = await createClient();
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: IMPORT_MODEL_SETTING_KEY, value: requested },
        { onConflict: "key" },
      );
    if (error)
      return {
        ok: false,
        model,
        message:
          "The default model could not be saved. Choose an enabled model.",
      };
    refreshImportPages();
    return {
      ok: true,
      model: requested,
      message: "The default import model was updated.",
    };
  } catch {
    return {
      ok: false,
      model,
      message: "The default model could not be saved.",
    };
  }
}

export async function saveImportModel(
  model: string,
  refreshOnly = false,
): Promise<ImportModelActionResult> {
  if (!(await canManageCourseImports()))
    return {
      ok: false,
      model,
      message: "Import management permission is required.",
    };
  try {
    const entry = await fetchCatalogueModel(model);
    const supabase = await createClient();
    const { enabled, visible, ...pricing } = entry;
    const { error } = refreshOnly
      ? await supabase
          .from("import_models")
          .update(pricing)
          .eq("id", entry.id)
          .eq("enabled", true)
          .select("id")
          .single()
      : await supabase
          .from("import_models")
          .upsert({ ...pricing, enabled, visible });
    if (error)
      return { ok: false, model, message: "The model could not be saved." };
    refreshImportPages();
    return {
      ok: true,
      model: entry.id,
      message: "The model and its pricing were saved.",
    };
  } catch {
    return {
      ok: false,
      model,
      message:
        "The model could not be loaded from OpenRouter. Check its identifier and try again.",
    };
  }
}

export async function removeImportModel(
  model: string,
): Promise<ImportModelActionResult> {
  if (!(await canManageCourseImports()))
    return {
      ok: false,
      model,
      message: "Import management permission is required.",
    };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("import_models")
      .update({ enabled: false })
      .eq("id", assertOpenRouterModel(model))
      .select("id")
      .single();
    if (error || !data)
      return {
        ok: false,
        model,
        message:
          "The model could not be removed. Choose another default first.",
      };
    refreshImportPages();
    return {
      ok: true,
      model,
      message: "The model was removed from future imports.",
    };
  } catch {
    return { ok: false, model, message: "The model could not be removed." };
  }
}

export async function setImportModelVisibility(
  model: string,
  visible: boolean,
): Promise<ImportModelActionResult> {
  if (!(await canManageCourseImports()))
    return {
      ok: false,
      model,
      message: "Import management permission is required.",
    };
  try {
    if (typeof visible !== "boolean")
      throw new Error("The visibility is invalid.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("import_models")
      .update({ visible })
      .eq("id", assertOpenRouterModel(model))
      .eq("enabled", true)
      .select("id")
      .single();
    if (error || !data)
      return {
        ok: false,
        model,
        message:
          "The model visibility could not be changed. Choose another default before hiding it.",
      };
    refreshImportPages();
    return {
      ok: true,
      model,
      message: visible
        ? "The model is available for selection."
        : "The model is hidden from selection.",
    };
  } catch {
    return {
      ok: false,
      model,
      message: "The model visibility could not be changed.",
    };
  }
}
