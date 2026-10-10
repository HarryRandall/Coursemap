import { beforeEach, expect, test, vi } from "vitest";
import * as actions from "@/lib/coursemap/actions";
import { emptyGuestState } from "@/lib/coursemap/guest-plan";
const mocks = vi.hoisted(() => ({ revalidate: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: { getClaims: async () => ({ data: { claims: {} } }) },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => ({
          data: {
            catalogue_version_id: 1,
            units_attempted: 6,
            units_earned: 6,
          },
          error: null,
        }),
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: "saved-id", error: null });
});
const changes = [
  () => actions.saveProfileAndPlan(emptyGuestState(2026).profile),
  () => actions.addPlanCourse("COMP1100", "2026-s1", 2026),
  () => actions.setCurrentUserPlanExtensionYears(1),
  () => actions.movePlanCourse("item", "2026-s2"),
  () => actions.removePlanCourse("item"),
  () => actions.recordCourseAttempt("item", "completed", 80, 6),
  () => actions.setCourseStar("COMP1100", true),
  () => actions.setRequirementPlacement("COMP1100", null),
];
test.each(changes.map((change, index) => [index, change] as const))(
  "plan mutation %s invalidates all plan consumers",
  async (_index, change) => {
    expect((await change()).ok).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  },
);
test("a rejected write leaves the router cache intact", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "Rejected." } });
  expect((await actions.setCourseStar("COMP1100", true)).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
