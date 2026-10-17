import { beforeEach, expect, test, vi } from "vitest";
import { loadCoursemapState } from "@/lib/coursemap/state";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";

const mocks = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  reads: new Map<string, number>(),
  selects: new Map<string, string[]>(),
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  finishLookups: null as null | (() => void),
  lookups: null as null | Promise<void>,
  failure: "",
  publicClient: vi.fn(),
  viewer: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
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
  const result = () => {
    mocks.reads.set(table, (mocks.reads.get(table) ?? 0) + 1);
    return {
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
    };
  };
  const builder = {
    select: (columns: string) => {
      mocks.selects.set(table, [...(mocks.selects.get(table) ?? []), columns]);
      return builder;
    },
    eq: () => builder,
    neq: () => builder,
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
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => {
      const value = result();
      if (
        mocks.lookups &&
        (table === "catalogue_codes" || (table === "academic_years" && many))
      ) {
        return mocks.lookups.then(() => resolve(value));
      }
      return Promise.resolve(value).then(resolve);
    },
  };
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.failure = "";
  mocks.results.clear();
  mocks.reads.clear();
  mocks.selects.clear();
  mocks.cacheEntries.clear();
  mocks.lookups = null;
  mocks.finishLookups = null;
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
  mocks.publicClient.mockReturnValue({ from: query });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

// Simulate React's request dispatcher without retaining entries between requests.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const entries = mocks.cacheEntries.get(fn) ?? new Map<string, unknown>();
      mocks.cacheEntries.set(fn, entries);
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursesBySelections: async () => [],
  courseFromSnapshotProjection: () => null,
}));
test("state and catalogue share the primary plan and its dependent reads within one request", async () => {
  await Promise.all([
    loadCoursemapState(viewer),
    loadCurrentUserPlanCatalogue(),
  ]);
  for (const table of [
    "profiles",
    "plans",
    "plan_items",
    "plan_structures",
    "course_attempts",
    "catalogue_versions",
  ]) {
    expect(mocks.reads.get(table), table).toBe(1);
  }
});
test("another request reads changed private data again", async () => {
  await loadCoursemapState(viewer);
  mocks.cacheEntries.clear();
  mocks.results.set("plans", null);
  expect(await loadCoursemapState(viewer)).toMatchObject({ attempts: [] });
  expect(mocks.reads.get("plans")).toBe(2);
});

test("state code and academic year lookups start together", async () => {
  mocks.lookups = new Promise<void>((resolve) => {
    mocks.finishLookups = resolve;
  });
  const pending = loadCoursemapState(viewer);
  try {
    await vi.waitFor(() => expect(mocks.reads.get("catalogue_codes")).toBe(1));
    expect(mocks.reads.get("academic_years")).toBeGreaterThanOrEqual(2);
  } finally {
    mocks.finishLookups?.();
    await pending;
  }
});

test("the planning catalogue reads plan course codes and years with their records", async () => {
  await loadCurrentUserPlanCatalogue();
  const recordReads = mocks.selects.get("catalogue_records") ?? [];
  expect(
    recordReads.some(
      (columns) =>
        columns.includes("catalogue_codes!") &&
        columns.includes("academic_years!"),
    ),
  ).toBe(true);
});
