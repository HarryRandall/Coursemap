import { beforeEach, expect, test, vi } from "vitest";
import { loadCatalogueYears } from "@/lib/coursemap/admin-catalogue";

const mocks = vi.hoisted(() => ({ from: vi.fn(), lte: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

beforeEach(() => {
  mocks.from.mockReset();
  mocks.lte.mockReset();
  mocks.from.mockImplementation((table) => {
    if (table !== "academic_years") {
      throw new Error("Year selection must not require catalogue discovery.");
    }
    return {
      select: () => ({ gte: () => ({ lte: mocks.lte }) }),
    };
  });
});

test("offers registered years before their first catalogue discovery", async () => {
  mocks.lte.mockResolvedValue({
    data: [{ year: 2025 }, { year: 2020 }, { year: 2030 }, { year: 2026 }],
    error: null,
  });

  expect(await loadCatalogueYears()).toEqual([2030, 2026, 2025, 2020]);
});

test("reports a failed year lookup", async () => {
  const error = new Error("The academic years could not be loaded.");
  mocks.lte.mockResolvedValue({ data: null, error });

  await expect(loadCatalogueYears()).rejects.toThrow(error);
});

test("handles an empty year registry", async () => {
  mocks.lte.mockResolvedValue({ data: [], error: null });

  expect(await loadCatalogueYears()).toEqual([]);
});
