import { beforeEach, expect, test, vi } from "vitest";
const { loadPage } = vi.hoisted(() => ({ loadPage: vi.fn() }));
vi.mock("@/lib/coursemap/published-courses", () => ({
  loadPublishedCoursePage: loadPage,
}));
import { GET } from "@/app/api/courses/search/route";

const course = {
  accent: "blue",
  code: "COMP1100",
  convener: "Not listed",
  delivery: "In Person",
  description: "Programming fundamentals.",
  incompatibilityText: "",
  level: 1000,
  name: "Programming as Problem Solving",
  prerequisiteCodes: [],
  prerequisiteText: "No prerequisites listed.",
  reviewState: "verified",
  school: "School of Computing",
  sessions: ["First Semester"],
  sourceUpdatedAt: null,
  sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP1100",
  subject: "COMP",
  units: 6,
  year: 2026,
};

beforeEach(() => vi.clearAllMocks());

test("recommended codes read the compact course list for the requested year", async () => {
  loadPage.mockResolvedValue({
    courses: [course],
    page: 1,
    pageSize: 2,
    total: 1,
  });
  const response = await GET(
    new Request(
      "http://localhost/api/courses/search?codes=comp1100,%20MATH1013&year=2026",
    ),
  );
  expect(loadPage).toHaveBeenCalledExactlyOnceWith({
    academicYear: 2026,
    filters: { codes: "COMP1100,MATH1013" },
    pageSize: 2,
  });
  expect(await response.json()).toEqual({
    courses: [
      expect.objectContaining({
        code: "COMP1100",
        incompatibilities: [],
        sessions: ["First Semester"],
      }),
    ],
    page: 1,
    pageSize: 1,
    total: 1,
  });
});

test("browse pages pass their filters and page to the directory", async () => {
  loadPage.mockResolvedValue({ courses: [], page: 3, pageSize: 20, total: 41 });
  const response = await GET(
    new Request(
      "http://localhost/api/courses/search?q=&browse=1&page=3&pageSize=20&year=2026&session=First%20Semester&level=2",
    ),
  );
  expect(loadPage).toHaveBeenCalledExactlyOnceWith({
    academicYear: 2026,
    filters: { query: "", level: "2", session: "First Semester" },
    page: 3,
    pageSize: 20,
  });
  expect(await response.json()).toEqual({
    courses: [],
    page: 3,
    pageSize: 20,
    total: 41,
  });
});

test("catalogue failures return a retryable error", async () => {
  loadPage.mockRejectedValue(new Error("unavailable"));
  const response = await GET(
    new Request("http://localhost/api/courses/search?codes=COMP1100&year=2026"),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Course search is temporarily unavailable.",
  });
});
