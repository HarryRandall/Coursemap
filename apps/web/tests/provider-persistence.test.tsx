import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AppProvider, useCoursemap, type AppState } from "@/app/providers";

const actions = vi.hoisted(() => ({
  addPlanCourse: vi.fn(),
  movePlanCourse: vi.fn(),
  removePlanCourse: vi.fn(),
  recordCourseAttempt: vi.fn(),
  saveProfileAndPlan: vi.fn(),
  setCurrentUserPlanExtensionYears: vi.fn(),
  setCourseStar: vi.fn(),
  setRequirementPlacement: vi.fn(),
}));
vi.mock("@/lib/coursemap/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@coursemap/ui/primitives/sonner", () => ({ Toaster: () => null }));

let context: ReturnType<typeof useCoursemap>;
function Consumer() {
  const value = useCoursemap();
  useEffect(() => {
    context = value;
  }, [value]);
  return (
    <div>{value.state.attempts.map((item) => item.courseCode).join(",")}</div>
  );
}
const initialState: AppState = {
  schemaVersion: 1,
  profile: {
    name: "Test Student",
    studentId: "",
    email: "student@example.test",
    commencementYear: 2026,
    catalogueYear: 2026,
    degreeCode: "",
    majorCode: "",
    minorCodes: [],
    specialisationCodes: [],
    studyLoad: "Full time",
    extensionYears: 0,
  },
  attempts: [
    {
      id: "saved-course",
      academicYear: 2026,
      courseCode: "COMP1100",
      termId: "2026-s1",
      status: "planned",
    },
  ],
};
async function mount() {
  render(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={initialState}
    >
      <Consumer />
    </AppProvider>,
  );
  await waitFor(() => expect(context.ready).toBe(true));
}
beforeEach(() => vi.resetAllMocks());

test("adds a course only after the server saves it", async () => {
  await mount();
  actions.addPlanCourse.mockResolvedValueOnce({
    ok: false,
    message: "The course could not be saved.",
  });
  await act(async () => {
    await context.addCourse("COMP1110", "2026-s2", 2026);
  });
  expect(context.state.attempts).toHaveLength(1);
  actions.addPlanCourse.mockResolvedValueOnce({
    ok: true,
    id: "database-id",
    message: "Saved",
  });
  await act(async () => {
    await context.addCourse("COMP1110", "2026-s2", 2026);
  });
  expect(actions.addPlanCourse).toHaveBeenLastCalledWith(
    "COMP1110",
    "2026-s2",
    2026,
  );
  expect(context.state.attempts[1].id).toBe("database-id");
});

test("restores a course position when the server rejects a move", async () => {
  await mount();
  actions.movePlanCourse.mockResolvedValue({
    ok: false,
    message: "The move could not be saved.",
  });
  await act(async () => {
    await context.reorderAttempt("saved-course", "2026-s2");
  });
  expect(actions.movePlanCourse).toHaveBeenCalledWith(
    "saved-course",
    "2026-s2",
    undefined,
  );
  expect(context.state.attempts[0].termId).toBe("2026-s1");
});

test("keeps the saved profile when its update fails", async () => {
  await mount();
  actions.saveProfileAndPlan.mockResolvedValue({
    ok: false,
    message: "The profile could not be saved.",
  });
  await act(async () => {
    await context.updateProfile({ name: "Unsaved name" });
  });
  expect(context.state.profile.name).toBe("Test Student");
});

function deferredResult() {
  let resolve!: (result: { ok: boolean; message: string }) => void;
  const promise = new Promise<{ ok: boolean; message: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("an unchanged server refresh preserves an optimistic move", async () => {
  const pending = deferredResult();
  actions.movePlanCourse.mockReturnValue(pending.promise);
  const view = render(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={initialState}
    >
      <Consumer />
    </AppProvider>,
  );
  await waitFor(() => expect(context.ready).toBe(true));
  let move!: ReturnType<typeof context.reorderAttempt>;
  await act(async () => {
    move = context.reorderAttempt("saved-course", "2026-s2");
  });
  view.rerender(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={structuredClone(initialState)}
    >
      <Consumer />
    </AppProvider>,
  );
  await act(async () => {});
  expect(context.state.attempts[0].termId).toBe("2026-s2");
  await act(async () => {
    pending.resolve({ ok: true, message: "Saved." });
    await move;
  });
});

test("a changed server plan resets state during render", async () => {
  const view = render(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={initialState}
    >
      <Consumer />
    </AppProvider>,
  );
  const changed = {
    ...initialState,
    profile: { ...initialState.profile, name: "Another student" },
  };
  view.rerender(
    <AppProvider viewer={null} canAccessAdmin={false} initialState={changed}>
      <Consumer />
    </AppProvider>,
  );
  expect(context.state.profile.name).toBe("Another student");
});

test("a failed star leaves another successful star in place", async () => {
  await mount();
  const first = deferredResult();
  actions.setCourseStar
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, message: "Saved." });
  let pending!: ReturnType<typeof context.toggleStar>;
  await act(async () => {
    pending = context.toggleStar("COMP1100");
  });
  await act(async () => {
    await context.toggleStar("COMP1110");
  });
  await act(async () => {
    first.resolve({ ok: false, message: "Failed." });
    await pending;
  });
  expect(context.state.starredCourses).toEqual(["COMP1110"]);
});

test("a failed placement leaves another successful placement in place", async () => {
  await mount();
  const first = deferredResult();
  actions.setRequirementPlacement
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, message: "Saved." });
  let pending!: ReturnType<typeof context.setPlacement>;
  await act(async () => {
    pending = context.setPlacement("COMP1100", {
      structureCode: "BCOMP",
      requirementKey: "first",
    });
  });
  await act(async () => {
    await context.setPlacement("COMP1110", {
      structureCode: "BCOMP",
      requirementKey: "second",
    });
  });
  await act(async () => {
    first.resolve({ ok: false, message: "Failed." });
    await pending;
  });
  expect(context.state.placements).toEqual([
    {
      courseCode: "COMP1110",
      structureCode: "BCOMP",
      requirementKey: "second",
    },
  ]);
});

test("a failed move leaves another successful move in place", async () => {
  const second = {
    ...initialState.attempts[0],
    id: "second-course",
    courseCode: "COMP1110",
  };
  render(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={{
        ...initialState,
        attempts: [...initialState.attempts, second],
      }}
    >
      <Consumer />
    </AppProvider>,
  );
  await waitFor(() => expect(context.ready).toBe(true));
  const first = deferredResult();
  actions.movePlanCourse
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, message: "Saved." });
  let pending!: ReturnType<typeof context.reorderAttempt>;
  await act(async () => {
    pending = context.reorderAttempt("saved-course", "2026-s2");
  });
  await act(async () => {
    await context.reorderAttempt("second-course", "2026-s2");
  });
  await act(async () => {
    first.resolve({ ok: false, message: "Failed." });
    await pending;
  });
  expect(
    context.state.attempts.find((item) => item.id === "saved-course")?.termId,
  ).toBe("2026-s1");
  expect(
    context.state.attempts.find((item) => item.id === "second-course")?.termId,
  ).toBe("2026-s2");
});

test("replacing a plan with the same contents resets optimistic state", async () => {
  const pending = deferredResult();
  actions.movePlanCourse.mockReturnValue(pending.promise);
  const firstPlan = { ...initialState, planId: "first-plan" };
  const view = render(
    <AppProvider viewer={null} canAccessAdmin={false} initialState={firstPlan}>
      <Consumer />
    </AppProvider>,
  );
  let move!: ReturnType<typeof context.reorderAttempt>;
  await act(async () => {
    move = context.reorderAttempt("saved-course", "2026-s2");
  });
  view.rerender(
    <AppProvider
      viewer={null}
      canAccessAdmin={false}
      initialState={{ ...firstPlan, planId: "replacement-plan" }}
    >
      <Consumer />
    </AppProvider>,
  );
  expect(context.state.attempts[0].termId).toBe("2026-s1");
  await act(async () => {
    pending.resolve({ ok: true, message: "Saved." });
    await move;
  });
});
