import { expect, test, vi } from "vitest";
import {
  loadClosestCourseEditions,
  loadPlanningCourseEditions,
} from "@/lib/coursemap/planning-course-editions";

const fixtures = vi.hoisted(() => ({
  load: vi.fn(async (selections: unknown) => selections),
  rows: [2024, 2026, 2028].map((academic_year) => ({
    code: "COMP1110",
    academic_year,
  })),
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: fixtures.rows, error: null }),
      }),
    }),
  }),
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursesBySelections: fixtures.load,
}));

test("guest planning selections load real editions before and after imported years", async () => {
  expect(
    await loadPlanningCourseEditions([
      { code: "COMP1110", year: 2027 },
      { code: "COMP1110", year: 2023 },
      { code: "COMP1110", year: 2028 },
      { code: "COMP9999", year: 2027 },
    ]),
  ).toEqual([
    { code: "COMP1110", year: 2026 },
    { code: "COMP1110", year: 2024 },
    { code: "COMP1110", year: 2028 },
  ]);
});

test("requirement courses load the nearest edition, the earlier on a tie, and skip unpublished codes", async () => {
  expect(
    await loadClosestCourseEditions(["COMP1110", "COMP9999"], 2027),
  ).toEqual([{ code: "COMP1110", year: 2026 }]);
  expect(await loadClosestCourseEditions(["COMP1110"], 2025)).toEqual([
    { code: "COMP1110", year: 2024 },
  ]);
});
