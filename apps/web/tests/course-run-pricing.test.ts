import { expect, it, vi } from "vitest";
import { ensureCourseRunPricing } from "../lib/catalogue-runs/pricing";

const now = Date.parse("2026-10-03T00:00:00Z");
const model = {
  id: "google/gemini-3.1-flash-lite",
  name: "Gemini",
  provider: "Google",
  enabled: true,
  visible: false,
  input_usd_per_million: 0.25,
  output_usd_per_million: 1.5,
  pricing_updated_at: "2026-09-01T00:00:00Z",
};

it("refreshes stale prices automatically without changing model visibility", async () => {
  const fresh = {
    ...model,
    visible: true,
    pricing_updated_at: "2026-10-03T00:00:00Z",
  };
  const fetchModel = vi.fn().mockResolvedValue(fresh);
  const savePricing = vi.fn().mockResolvedValue(undefined);
  const result = await ensureCourseRunPricing(model, {
    fetchModel,
    savePricing,
    now,
  });
  expect(fetchModel).toHaveBeenCalledWith(model.id);
  expect(savePricing).toHaveBeenCalledWith(fresh);
  expect(result.visible).toBe(false);
  expect(result.pricing_updated_at).toBe(fresh.pricing_updated_at);
});

it("uses current saved prices without another network request", async () => {
  const fetchModel = vi.fn();
  const savePricing = vi.fn();
  await ensureCourseRunPricing(
    { ...model, pricing_updated_at: "2026-10-02T00:00:00Z" },
    { fetchModel, savePricing, now },
  );
  expect(fetchModel).not.toHaveBeenCalled();
  expect(savePricing).not.toHaveBeenCalled();
});

it("holds the estimate if refreshed prices are incomplete", async () => {
  const savePricing = vi.fn();
  await expect(
    ensureCourseRunPricing(model, {
      now,
      savePricing,
      fetchModel: vi
        .fn()
        .mockResolvedValue({ ...model, output_usd_per_million: null }),
    }),
  ).rejects.toThrow("No import has started");
  expect(savePricing).not.toHaveBeenCalled();
});
