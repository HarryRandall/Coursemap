import { expect, test } from "vitest";
import {
  closestCourseEdition,
  closestEditionYear,
} from "@/lib/coursemap/course-edition-year";
import { courses } from "./fixtures/catalogue";

test("the nearest edition year stands in, the earlier of two equally near", () => {
  expect(closestEditionYear(2026, [2023, 2026, 2027])).toBe(2026);
  expect(closestEditionYear(2026, [2020, 2025, 2029])).toBe(2025);
  expect(closestEditionYear(2026, [2028, 2024])).toBe(2024);
  expect(closestEditionYear(2026, [])).toBeNull();
});

test("a course's edition comes from the plan year, then the nearest year", () => {
  const [course] = courses;
  const editions = [
    { ...course, year: 2028 },
    { ...course, year: 2024 },
  ];
  expect(closestCourseEdition(editions, course.code, 2026)?.year).toBe(2024);
  expect(
    closestCourseEdition([...editions, course], course.code, 2026)?.year,
  ).toBe(2026);
  expect(closestCourseEdition(editions, "ZZZZ9999", 2026)).toBeUndefined();
});
