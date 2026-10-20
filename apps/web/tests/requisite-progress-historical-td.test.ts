import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projections: vi.fn(),
  years: vi.fn(),
  designations: vi.fn(),
  filters: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({
  getAuthViewer: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/coursemap/historical-td-evidence", () => ({
  loadOwnedAttemptProjections: mocks.projections,
  loadAttemptCalendarYears: mocks.years,
  loadPublishedTdDesignations: mocks.designations,
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  courseFromSnapshotProjection: (projection: object, snapshotId: number) => ({
    ...projection,
    snapshotId,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (key: string, value: unknown): unknown => {
          mocks.filters(key, value);
          return table === "course_attempts" && key === "status"
            ? Promise.resolve({
                data: [
                  {
                    id: "a",
                    catalogue_version_id: 8065,
                    academic_period_id: 7,
                    units_earned: 6,
                  },
                ],
                error: null,
              })
            : query;
        },
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  }),
}));

import { loadCurrentUserRequisiteCompletion } from "@/lib/coursemap/requisite-progress";

beforeEach(() => {
  mocks.filters.mockReset();
  mocks.projections.mockResolvedValue([
    {
      version_id: 8065,
      projection: { code: "INFS2005", year: 2026, tags: [], units: 12 },
    },
  ]);
  mocks.years.mockResolvedValue({ a: 2026 });
  mocks.designations.mockResolvedValue([
    { code: "INFS2005", year: 2026, status: "member" },
  ]);
});

test("adds confirmed TD credit without replacing original tags or earned units", async () => {
  const result = await loadCurrentUserRequisiteCompletion();
  expect(result.completedCourses).toEqual([
    {
      code: "INFS2005",
      units: 6,
      tags: [],
      tdUnits: { confirmed: 6, unknown: 0 },
    },
  ]);
  expect(mocks.filters).toHaveBeenCalledWith("owner_id", "owner");
  expect(mocks.filters).toHaveBeenCalledWith("status", "completed");
});
test("unavailable public evidence keeps completed credit with an unknown designation", async () => {
  mocks.designations.mockResolvedValue([]);
  expect((await loadCurrentUserRequisiteCompletion()).completedCourses).toEqual(
    [
      {
        code: "INFS2005",
        units: 6,
        tags: [],
        tdUnits: { confirmed: 0, unknown: 6 },
      },
    ],
  );
});
test("saved native tags remain measured in the same actual year without a repair fact", async () => {
  mocks.projections.mockResolvedValue([
    {
      version_id: 8065,
      projection: {
        code: "INFS2005",
        year: 2026,
        tags: ["Transdisciplinary Problem-Solving"],
      },
    },
  ]);
  mocks.designations.mockResolvedValue([]);
  expect(
    (await loadCurrentUserRequisiteCompletion()).completedCourses[0]?.tdUnits,
  ).toEqual({ confirmed: 6, unknown: 0 });
  mocks.years.mockResolvedValue({ a: 2027 });
  expect(
    (await loadCurrentUserRequisiteCompletion()).completedCourses[0]?.tdUnits,
  ).toEqual({ confirmed: 0, unknown: 6 });
});
