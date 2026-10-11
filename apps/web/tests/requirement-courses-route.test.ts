import { beforeEach, expect, test, vi } from "vitest";
const { loadPage, convert } = vi.hoisted(() => ({
  loadPage: vi.fn(),
  convert: vi.fn((course) => course),
}));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursePage: loadPage,
}));
vi.mock("@/lib/coursemap/plan-catalogue", () => ({
  planCourseFromDetails: convert,
}));
import { GET } from "@/app/api/requirements/courses/route";

beforeEach(() => vi.clearAllMocks());
test("bounded rules return twelve courses with totals and cursor in the requested year", async () => {
  loadPage.mockResolvedValue({ courses: [{ code: "COMP3100" }], total: 30 });
  const result = await GET(
    new Request(
      "http://localhost/api/requirements/courses?year=2025&subject=COMP&level=2-3&cursor=2",
    ),
  );
  expect(await result.json()).toEqual({
    courses: [{ code: "COMP3100" }],
    total: 30,
    nextCursor: "3",
  });
  expect(loadPage).toHaveBeenCalledWith({
    academicYear: 2025,
    filters: { codes: "", subject: "COMP", tag: "", level: "2-3" },
    page: 2,
    pageSize: 12,
  });
});
test.each([
  "year=2025",
  "year=2025&level=3+",
  "year=2025&subject=COMP&cursor=-1",
  "year=2025&subject=COMP&level=3-2",
  "year=2025&codes=invalid",
  "year=invalid&tag=Science",
])("invalid or unbounded query is rejected: %s", async (query) => {
  expect(
    (
      await GET(
        new Request(`http://localhost/api/requirements/courses?${query}`),
      )
    ).status,
  ).toBe(400);
  expect(loadPage).not.toHaveBeenCalled();
});
test("explicit lists and tags are supported and final pages have no cursor", async () => {
  loadPage.mockResolvedValue({ courses: [], total: 0 });
  const result = await GET(
    new Request(
      "http://localhost/api/requirements/courses?year=2026&codes=COMP1100,COMP1110",
    ),
  );
  expect(await result.json()).toEqual({
    courses: [],
    total: 0,
    nextCursor: null,
  });
  expect(
    (
      await GET(
        new Request(
          "http://localhost/api/requirements/courses?year=2026&tag=Science",
        ),
      )
    ).status,
  ).toBe(200);
});
test("catalogue failures return a retryable error", async () => {
  loadPage.mockRejectedValue(new Error("unavailable"));
  const result = await GET(
    new Request(
      "http://localhost/api/requirements/courses?year=2026&subject=COMP",
    ),
  );
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({
    error: "Matching courses are temporarily unavailable.",
  });
});
