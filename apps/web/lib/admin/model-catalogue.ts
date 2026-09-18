import { assertOpenRouterModel } from "@/lib/catalogue-import/openrouter";
import type { ImportModel } from "@/lib/admin/import-model";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenRate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const rate = Number(value) * 1_000_000;
  return Number.isFinite(rate) && rate >= 0 && rate < 1_000_000 ? rate : null;
}

export function readCatalogueModel(
  payload: unknown,
  requested: string,
): ImportModel {
  const id = assertOpenRouterModel(requested);
  if (!isRecord(payload) || !Array.isArray(payload.data))
    throw new Error("The model catalogue could not be read.");
  const model = payload.data.find(
    (item: unknown) => isRecord(item) && item.id === id,
  );
  if (!isRecord(model) || typeof model.name !== "string")
    throw new Error("The model was not found in OpenRouter's catalogue.");
  const pricing = isRecord(model.pricing) ? model.pricing : {};
  const [provider, ...name] = model.name.split(": ");
  return {
    id,
    name: (name.join(": ") || model.name).slice(0, 160),
    provider: (name.length ? provider : id.split("/")[0]!).slice(0, 80),
    enabled: true,
    visible: true,
    input_usd_per_million: tokenRate(pricing.prompt),
    output_usd_per_million: tokenRate(pricing.completion),
    pricing_updated_at: new Date().toISOString(),
  };
}

export async function fetchCatalogueModel(id: string) {
  assertOpenRouterModel(id);
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error("OpenRouter's model catalogue is unavailable.");
  return readCatalogueModel(await response.json(), id);
}
