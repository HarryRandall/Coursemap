import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AppProvider, useCoursemap, type AppState } from "@/app/providers";
import { decodeGuestPlan, emptyGuestState } from "@/lib/coursemap/guest-plan";

const actions = vi.hoisted(() => ({
  addPlanCourse: vi.fn(),
  movePlanCourse: vi.fn(),
  removePlanCourse: vi.fn(),
  recordCourseAttempt: vi.fn(),
  saveProfileAndPlan: vi.fn(),
  setCourseStar: vi.fn(),
  setCurrentUserPlanExtensionYears: vi.fn(),
  setRequirementPlacement: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/coursemap/actions", () => actions);
vi.mock("@/lib/coursemap/guest-plan-transfer", () => ({
  transferGuestPlan: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh, replace: vi.fn() }),
}));
vi.mock("@coursemap/ui/primitives/sonner", () => ({ Toaster: () => null }));

let context: ReturnType<typeof useCoursemap>;
function Consumer() {
  const value = useCoursemap();
  useEffect(() => {
    context = value;
  }, [value]);
  return null;
}

function savedPlan() {
  const cookies = new Map(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      }),
  );
  return decodeGuestPlan((name) => cookies.get(name) || undefined);
}

const initialState: AppState = {
  ...emptyGuestState(2026),
  profile: { ...emptyGuestState(2026).profile, degreeCode: "BFINN" },
};

async function mount() {
  render(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      guest
      initialState={initialState}
    >
      <Consumer />
    </AppProvider>,
  );
  await waitFor(() => expect(context.ready).toBe(true));
}

beforeEach(() => {
  vi.resetAllMocks();
  document.cookie
    .split("; ")
    .filter(Boolean)
    .forEach((pair) => {
      document.cookie = `${pair.split("=")[0]}=; Max-Age=0; Path=/`;
    });
});

test("a guest's changes are kept in this browser, not sent to an account", async () => {
  await mount();
  expect(context.guest).toBe(true);
  await act(async () => {
    await context.addCourse("FINM1001", "2026-s1", 2026);
    await context.addCourse("ECON1101", "2026-s1", 2026);
    await context.toggleStar("STAT1008");
    await context.updateProfile({ name: "Ada" });
  });
  await act(async () => {
    const [first] = context.state.attempts;
    await context.reorderAttempt(first.id, "2026-s2");
    await context.setPlanExtensionYears(1);
  });

  const saved = savedPlan();
  expect(
    saved?.attempts.map(({ courseCode, termId }) => [courseCode, termId]),
  ).toEqual([
    ["ECON1101", "2026-s1"],
    ["FINM1001", "2026-s2"],
  ]);
  expect(saved?.starredCourses).toEqual(["STAT1008"]);
  expect(saved?.profile).toMatchObject({
    name: "Ada",
    degreeCode: "BFINN",
    extensionYears: 1,
  });
  expect(context.state.attempts).toEqual(saved?.attempts);
  Object.entries(actions)
    .filter(([name]) => name !== "refresh")
    .forEach(([, action]) => expect(action).not.toHaveBeenCalled());
});

test("a guest can remove a course and record a result", async () => {
  await mount();
  await act(async () => {
    await context.addCourse("FINM1001", "2025-s1", 2025);
    await context.addCourse("ECON1101", "2026-s1", 2026);
  });
  const [finance, economics] = context.state.attempts;
  await act(async () => {
    await context.updateAttempt(finance.id, "completed", 81, 6);
    await context.removeAttempt(economics.id);
  });
  expect(savedPlan()?.attempts).toEqual([
    expect.objectContaining({
      courseCode: "FINM1001",
      status: "completed",
      mark: 81,
      unitsEarned: 6,
    }),
  ]);
});

test("every successful guest cookie change clears cached route state", async () => {
  await mount();
  const changes = [
    () => context.updateProfile({ name: "Ada" }),
    () => context.addCourse("COMP1100", "2026-s1", 2026),
    () => context.reorderAttempt(context.state.attempts[0].id, "2026-s2"),
    () => context.setPlanExtensionYears(1),
    () => context.toggleStar("COMP1110"),
    () =>
      context.setPlacement("COMP1100", {
        structureCode: "BCOMP",
        requirementKey: "core",
      }),
    () =>
      context.saveGuestResult(context.state.attempts[0].id, {
        status: "completed",
        mark: 80,
      }),
    () => context.saveGuestResult(context.state.attempts[0].id, null),
  ];
  for (const change of changes) {
    actions.refresh.mockClear();
    await act(async () => {
      expect((await change()).ok).toBe(true);
    });
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  }
});

test("a guest cookie that cannot be saved leaves both state and cached routes intact", async () => {
  await mount();
  const before = context.state;
  await act(async () => {
    expect((await context.updateProfile({ name: "A".repeat(50_000) })).ok).toBe(
      false,
    );
  });
  expect(context.state).toBe(before);
  expect(actions.refresh).not.toHaveBeenCalled();
});
