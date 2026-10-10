import { beforeEach, expect, test, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc }),
}));
import {
  loadPublishedCoursesByCodes,
  loadPublishedCoursesBySelections,
} from "@/lib/coursemap/published-courses";
beforeEach(() => rpc.mockReset());

test.each(["codes", "selections"])(
  "limits concurrent cold detail RPCs for %s and keeps normalisation",
  async (kind) => {
    let active = 0;
    let maximum = 0;
    rpc.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { data: null, error: null };
    });
    const codes = Array.from(
      { length: 12 },
      (_, index) => `COMP${1100 + index}`,
    );
    if (kind === "codes")
      await loadPublishedCoursesByCodes(
        [...codes, "comp1100", "invalid"],
        2026,
      );
    else
      await loadPublishedCoursesBySelections([
        ...codes.map((code) => ({ code, year: 2026 })),
        { code: "comp1100", year: 2026 },
        { code: "invalid", year: 2026 },
      ]);
    expect(rpc).toHaveBeenCalledTimes(12);
    expect(maximum).toBeLessThanOrEqual(4);
  },
);

test("a failed detail read still rejects instead of dropping the course", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "statement timeout" },
  });
  await expect(loadPublishedCoursesByCodes(["COMP1100"], 2026)).rejects.toThrow(
    "statement timeout",
  );
});
