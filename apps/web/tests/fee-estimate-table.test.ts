import { beforeEach, expect, test, vi } from "vitest";
import { buildFeeEstimateTable } from "@/lib/academic/fee-estimates";
vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc }),
}));
const { loadFeeEstimateTable } =
  await import("@/lib/coursemap/fee-estimate-table");
beforeEach(() => rpc.mockReset());
test("builds the same median and outlier groups through one request", async () => {
  const amounts = [600, 606, 612, 618, 624, 630, 60000];
  rpc.mockResolvedValue({
    data: amounts.map((amount) => ({
      academicCareer: "UGRD",
      college: "Science",
      subject: "COMP",
      units: 6,
      fees: [
        { audience: "domestic", amount, basis: "course" },
        { audience: "international", amount: 100, basis: "unit" },
      ],
    })),
    error: null,
  });
  const result = await loadFeeEstimateTable(2026);
  expect(result).toEqual(
    buildFeeEstimateTable(
      amounts.map((amount) => ({
        year: 2026,
        academicCareer: "UGRD",
        college: "Science",
        subject: "COMP",
        perUnit: { domestic: amount / 6, international: 100 },
      })),
    ),
  );
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "published_fee_reference_courses",
    { academic_year: 2026 },
  );
});
test("handles a year with no publication and propagates read failures", async () => {
  rpc.mockResolvedValueOnce({ data: [], error: null });
  expect(await loadFeeEstimateTable(2099)).toEqual({});
  rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
  await expect(loadFeeEstimateTable(2026)).rejects.toMatchObject({
    code: "57014",
  });
});
