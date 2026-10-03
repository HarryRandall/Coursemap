import type { ImportModel } from "../admin/import-model";

/** Refresh the free public price catalogue before reserving paid work. */
export async function ensureCourseRunPricing(
  model: ImportModel,
  {
    fetchModel,
    savePricing,
    now = Date.now(),
  }: {
    fetchModel: (id: string) => Promise<ImportModel>;
    savePricing: (model: ImportModel) => Promise<void>;
    now?: number;
  },
) {
  const updated = Date.parse(model.pricing_updated_at ?? "");
  if (
    model.input_usd_per_million !== null &&
    model.output_usd_per_million !== null &&
    Number.isFinite(updated) &&
    now - updated <= 7 * 24 * 60 * 60 * 1000
  )
    return model;
  try {
    const fresh = await fetchModel(model.id);
    if (
      fresh.id !== model.id ||
      fresh.input_usd_per_million === null ||
      fresh.output_usd_per_million === null
    )
      throw new Error("Pricing is incomplete.");
    await savePricing(fresh);
    return {
      ...model,
      ...fresh,
      enabled: model.enabled,
      visible: model.visible,
    };
  } catch {
    throw new Error(
      "Current model prices could not be loaded. Retry the estimate when OpenRouter is available. No import has started.",
    );
  }
}
