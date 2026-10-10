import { beforeEach, expect, test, vi } from "vitest";
import { withPlanningState } from "@/ui/plan/planning-page";
const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  guest: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({ getAuthContext: mocks.auth }));
vi.mock("@/lib/coursemap/state", () => ({ loadCoursemapState: mocks.state }));
vi.mock("@/lib/coursemap/guest-plan-server", () => ({
  readGuestPlan: mocks.guest,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    viewer: { id: "student" },
    canAccessAdmin: true,
  });
  mocks.state.mockResolvedValue({ planId: "plan", profile: {}, attempts: [] });
});
test("the page starts before its plan read completes and receives the full state", async () => {
  let finish!: (value: unknown) => void;
  mocks.state.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const page = vi.fn(async (props: { label: string }) => props.label);
  const pending = withPlanningState(page)({ label: "Planner" });
  await vi.waitFor(() =>
    expect(page).toHaveBeenCalledWith({ label: "Planner" }),
  );
  const state = { planId: "plan", attempts: [{ courseCode: "COMP1100" }] };
  finish(state);
  const provider = await pending;
  expect(provider.props.initialState).toBe(state);
  expect(provider.props.children).toBe("Planner");
  expect(provider.props.renderGlobalUi).toBe(false);
});
test("a failed private read propagates rather than showing an empty plan", async () => {
  const error = new Error("Private read failed.");
  mocks.state.mockRejectedValue(error);
  await expect(withPlanningState(async () => "Planner")({})).rejects.toBe(
    error,
  );
});
test("guest planning uses the exact cookie state without querying private data", async () => {
  mocks.auth.mockResolvedValue({ viewer: null, canAccessAdmin: false });
  const guest = { profile: { name: "Guest" }, attempts: [] };
  mocks.guest.mockResolvedValue(guest);
  const provider = await withPlanningState(async () => "Planner")({});
  expect(provider.props.initialState).toBe(guest);
  expect(provider.props.guest).toBe(true);
  expect(mocks.state).not.toHaveBeenCalled();
});
