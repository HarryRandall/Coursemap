import { beforeEach, expect, test, vi } from "vitest";
import { hasPrimaryPlan, loadCoursemapState } from "@/lib/coursemap/state";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";

const mocks = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  failure: "",
  publicClient: vi.fn(),
  viewer: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({ getAuthViewer: mocks.viewer }));
vi.mock("@/lib/coursemap/guest-plan-server", () => ({
  readGuestPlan: async () => null,
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: mocks.publicClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
const viewer = { id: "student", email: "student@example.test" };
const failure = { message: "Database unavailable.", code: "42501" };
function query(table: string) {
  let many = false;
  const result = () => ({
    data:
      mocks.failure === table || (many && mocks.failure === `${table}:many`)
        ? null
        : mocks.results.has(table)
          ? mocks.results.get(table)
          : [],
    error:
      mocks.failure === table || (many && mocks.failure === `${table}:many`)
        ? failure
        : null,
  });
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => {
      many = true;
      return builder;
    },
    is: () => builder,
    not: () => builder,
    order: () => builder,
    maybeSingle: async () => {
      const value = result();
      return {
        ...value,
        data: Array.isArray(value.data) ? (value.data[0] ?? null) : value.data,
      };
    },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.failure = "";
  mocks.results.clear();
  mocks.results.set("profiles", { display_name: "Student" });
  mocks.results.set("plans", {
    id: "plan",
    academic_year_id: 1,
    commencement_year: 2026,
    extension_years: 0,
  });
  mocks.results.set("academic_years", [{ id: 1, year: 2026 }]);
  mocks.results.set("plan_items", [{ id: "item", catalogue_record_id: 2 }]);
  mocks.results.set("course_attempts", [
    { id: "attempt", catalogue_version_id: 3, academic_period_id: 4 },
  ]);
  mocks.results.set("catalogue_versions", [
    { id: 3, record_id: 2, academic_year_id: 1 },
  ]);
  mocks.results.set("catalogue_records", [
    {
      id: 2,
      code_id: 5,
      academic_year_id: 1,
      published_version_id: 3,
      archived_at: null,
    },
  ]);
  mocks.results.set("catalogue_codes", [{ id: 5, code: "COMP1100" }]);
  mocks.viewer.mockResolvedValue(viewer);
  mocks.client.mockResolvedValue({ from: query, rpc: mocks.rpc });
  // Public fallback must not hide an authenticated read failure.
  mocks.publicClient.mockImplementation(() => {
    throw new Error("Unexpected public fallback.");
  });
});
const stateTables = [
  "profiles",
  "plans",
  "academic_years",
  "plan_structures",
  "plan_items",
  "course_attempts",
  "plan_requirement_placements",
  "plan_starred_courses",
  "academic_periods",
  "catalogue_versions",
  "catalogue_records",
  "catalogue_codes",
  "academic_years:many",
];
test.each(stateTables)(
  "state read propagates errors from %s",
  async (table) => {
    mocks.failure = table;
    await expect(loadCoursemapState(viewer)).rejects.toEqual(failure);
  },
);
test("state read propagates a client creation failure", async () => {
  mocks.client.mockRejectedValueOnce(failure);
  await expect(loadCoursemapState(viewer)).rejects.toEqual(failure);
});
test("a student without a plan retains their profile and empty attempts", async () => {
  mocks.results.set("plans", null);
  expect(await loadCoursemapState(viewer)).toMatchObject({
    profile: { name: "Student" },
    attempts: [],
  });
});
test("primary plan existence does not treat query errors as absence", async () => {
  mocks.failure = "plans";
  await expect(hasPrimaryPlan(viewer)).rejects.toEqual(failure);
});
test.each([
  "plans",
  "academic_years",
  "plan_items",
  "course_attempts",
  "plan_structures",
  "catalogue_versions",
  "catalogue_records",
  "catalogue_codes",
  "academic_years:many",
])("planning catalogue propagates errors from %s", async (table) => {
  mocks.failure = table;
  await expect(loadCurrentUserPlanCatalogue()).rejects.toEqual(failure);
  expect(mocks.publicClient).not.toHaveBeenCalled();
});

test("historical attempt projection errors reach the planning error handler", async () => {
  mocks.publicClient.mockReturnValue({ from: () => query("no-public-year") });
  mocks.rpc.mockResolvedValue({ data: null, error: failure });
  await expect(loadCurrentUserPlanCatalogue()).rejects.toEqual(failure);
});
test("a missing year for an existing plan is an error", async () => {
  mocks.results.set("academic_years", null);
  await expect(loadCurrentUserPlanCatalogue()).rejects.toThrow(
    "plan catalogue year",
  );
  expect(mocks.publicClient).not.toHaveBeenCalled();
});
test.each(["signed out", "no plan"])(
  "%s can still load the public empty catalogue",
  async (mode) => {
    if (mode === "signed out") mocks.viewer.mockResolvedValue(null);
    else mocks.results.set("plans", null);
    mocks.publicClient.mockReturnValue({
      from: () => query("no-public-records"),
    });
    expect(await loadCurrentUserPlanCatalogue()).toMatchObject({
      academicYear: null,
      courses: [],
    });
  },
);
test("primary plan absence remains a successful empty result", async () => {
  mocks.results.set("plans", null);
  expect(await hasPrimaryPlan(viewer)).toBe(false);
});
