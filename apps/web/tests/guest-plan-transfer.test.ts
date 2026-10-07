import { beforeEach, expect, test, vi } from "vitest";
import { emptyGuestState } from "@/lib/coursemap/guest-plan";
import type { AppState } from "@/lib/coursemap/types";

const mocks = vi.hoisted(() => ({
  viewer: { id: "student", email: "student@example.test" } as {
    id: string;
    email: string;
  } | null,
  guest: null as AppState | null,
  accountHasPlan: false,
  account: null as AppState | null,
  clearGuestPlan: vi.fn(),
  addPlanCourse: vi.fn(),
  recordCourseAttempt: vi.fn(),
  removePlanCourse: vi.fn(),
  saveProfileAndPlan: vi.fn(),
  setCourseStar: vi.fn(),
  setCurrentUserPlanExtensionYears: vi.fn(),
  setRequirementPlacement: vi.fn(),
  planItems: [] as { id: string }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({
  getAuthViewer: async () => mocks.viewer,
}));
vi.mock("@/lib/coursemap/guest-plan-server", () => ({
  readGuestPlan: async () => mocks.guest,
  clearGuestPlan: mocks.clearGuestPlan,
}));
vi.mock("@/lib/coursemap/state", () => ({
  hasPrimaryPlan: async () => mocks.accountHasPlan,
  loadCoursemapState: async () => mocks.account,
}));
vi.mock("@/lib/coursemap/actions", () => ({
  addPlanCourse: mocks.addPlanCourse,
  recordCourseAttempt: mocks.recordCourseAttempt,
  removePlanCourse: mocks.removePlanCourse,
  saveProfileAndPlan: mocks.saveProfileAndPlan,
  setCourseStar: mocks.setCourseStar,
  setCurrentUserPlanExtensionYears: mocks.setCurrentUserPlanExtensionYears,
  setRequirementPlacement: mocks.setRequirementPlacement,
}));
vi.mock("@/lib/supabase/server", () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { id: "plan" } }),
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: mocks.planItems }),
  };
  return { createClient: async () => ({ from: () => query }) };
});

const { transferGuestPlan } =
  await import("@/lib/coursemap/guest-plan-transfer");

const guestPlan: AppState = {
  ...emptyGuestState(2026),
  profile: {
    ...emptyGuestState(2026).profile,
    name: "Ada",
    degreeCode: "BFINN",
    extensionYears: 1,
  },
  attempts: [
    {
      id: "g1",
      courseCode: "FINM1001",
      termId: "2025-s1",
      academicYear: 2025,
      status: "completed",
      mark: 80,
      unitsAttempted: 6,
    },
    {
      id: "g2",
      courseCode: "ECON1101",
      termId: "2026-s1",
      academicYear: 2026,
      status: "planned",
    },
  ],
  starredCourses: ["STAT1008"],
  placements: [
    { courseCode: "ECON1101", structureCode: "BFINN", requirementKey: "k" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer = { id: "student", email: "student@example.test" };
  mocks.guest = guestPlan;
  mocks.accountHasPlan = false;
  mocks.account = emptyGuestState(2026);
  mocks.planItems = [];
  mocks.saveProfileAndPlan.mockResolvedValue({ ok: true, message: "" });
  mocks.addPlanCourse.mockImplementation(async (code: string) => ({
    ok: true,
    id: `item-${code}`,
    message: "",
  }));
  for (const action of [
    mocks.removePlanCourse,
    mocks.setCourseStar,
    mocks.setCurrentUserPlanExtensionYears,
    mocks.setRequirementPlacement,
  ])
    action.mockResolvedValue({ ok: true, message: "" });
  mocks.recordCourseAttempt.mockResolvedValue({ ok: true, message: "" });
});

test("a new account takes the guest plan and the browser copy is cleared", async () => {
  const result = await transferGuestPlan("if-empty");

  expect(result.status).toBe("imported");
  expect(mocks.saveProfileAndPlan).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Ada",
      degreeCode: "BFINN",
      email: "student@example.test",
    }),
  );
  expect(mocks.setCurrentUserPlanExtensionYears).toHaveBeenCalledWith(1);
  expect(mocks.addPlanCourse).toHaveBeenCalledWith("FINM1001", "2025-s1", 2025);
  expect(mocks.recordCourseAttempt).toHaveBeenCalledWith(
    "item-FINM1001",
    "completed",
    80,
    6,
  );
  expect(mocks.recordCourseAttempt).toHaveBeenCalledTimes(1);
  expect(mocks.setCourseStar).toHaveBeenCalledWith("STAT1008", true);
  expect(mocks.setRequirementPlacement).toHaveBeenCalledWith("ECON1101", {
    structureCode: "BFINN",
    requirementKey: "k",
  });
  expect(mocks.clearGuestPlan).toHaveBeenCalled();
});

test("an account that already has a plan is asked before anything changes", async () => {
  mocks.accountHasPlan = true;
  const result = await transferGuestPlan("if-empty");

  expect(result.status).toBe("conflict");
  expect(mocks.saveProfileAndPlan).not.toHaveBeenCalled();
  expect(mocks.clearGuestPlan).not.toHaveBeenCalled();
});

test("replacing clears the account's planned courses but keeps recorded results", async () => {
  mocks.accountHasPlan = true;
  mocks.planItems = [{ id: "old-1" }, { id: "old-2" }];
  mocks.account = {
    ...emptyGuestState(2026),
    attempts: [
      {
        id: "recorded",
        courseCode: "FINM1001",
        termId: "2025-s1",
        status: "completed",
      },
    ],
  };
  const result = await transferGuestPlan("replace");

  expect(result.status).toBe("imported");
  expect(mocks.removePlanCourse.mock.calls).toEqual([["old-1"], ["old-2"]]);
  // FINM1001 already has a recorded result in the account, so only the
  // planned course moves across.
  expect(mocks.addPlanCourse.mock.calls.map(([code]) => code)).toEqual([
    "ECON1101",
  ]);
});

test("discarding forgets the guest plan without touching the account", async () => {
  const result = await transferGuestPlan("discard");

  expect(result.status).toBe("done");
  expect(mocks.clearGuestPlan).toHaveBeenCalled();
  expect(mocks.saveProfileAndPlan).not.toHaveBeenCalled();
});

test("a failed profile save keeps the guest plan for another try", async () => {
  mocks.saveProfileAndPlan.mockResolvedValue({
    ok: false,
    message: "Couldn't save that change.",
  });
  const result = await transferGuestPlan("if-empty");

  expect(result).toEqual({
    status: "failed",
    message: "Couldn't save that change.",
  });
  expect(mocks.addPlanCourse).not.toHaveBeenCalled();
  expect(mocks.clearGuestPlan).not.toHaveBeenCalled();
});

test("invalid choices cannot replace an account plan", async () => {
  mocks.accountHasPlan = true;
  expect((await transferGuestPlan("invalid" as "replace")).status).toBe(
    "failed",
  );
  expect(mocks.saveProfileAndPlan).not.toHaveBeenCalled();
  expect(mocks.removePlanCourse).not.toHaveBeenCalled();
});

test("a failed replacement profile save does not remove planned courses", async () => {
  mocks.accountHasPlan = true;
  mocks.saveProfileAndPlan.mockResolvedValue({
    ok: false,
    message: "Save failed",
  });
  expect((await transferGuestPlan("replace")).status).toBe("failed");
  expect(mocks.removePlanCourse).not.toHaveBeenCalled();
  expect(mocks.clearGuestPlan).not.toHaveBeenCalled();
});

test("partial course failures keep the browser copy", async () => {
  mocks.addPlanCourse.mockResolvedValue({ ok: false, message: "Unavailable" });
  expect((await transferGuestPlan("if-empty")).status).toBe("failed");
  expect(mocks.clearGuestPlan).not.toHaveBeenCalled();
});

test("unexpected storage failures keep the browser copy", async () => {
  mocks.accountHasPlan = true;
  mocks.planItems = [{ id: "old" }];
  mocks.removePlanCourse.mockRejectedValue(new Error("Network failure"));
  expect((await transferGuestPlan("replace")).status).toBe("failed");
  expect(mocks.clearGuestPlan).not.toHaveBeenCalled();
});
