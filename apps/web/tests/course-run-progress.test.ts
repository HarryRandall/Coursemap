import { expect, it } from "vitest";
import {
  courseRunAnalysis,
  courseRunSegments,
  type CourseRunProgress,
} from "../lib/catalogue-runs/progress";
const run: CourseRunProgress = {
  id: "test",
  created_at: "2026-10-03",
  state: "active",
  pause_reason: null,
  total: 50,
  finished: 50,
  review: 15,
  drafts: 0,
  failed: 0,
  imported: 50,
  published: 35,
  spent_usd: "0.02",
  reserved_usd: "0",
  budget_usd: "0.5",
  publish_verified: true,
  publication_blockers: [],
  paid_courses: 13,
  free_courses: 37,
};
it("keeps held courses distinct from published progress", () => {
  expect(courseRunSegments(run)).toEqual({
    published: 35,
    drafts: 0,
    review: 15,
    failed: 0,
    stopped: 0,
    other: 0,
    pending: 0,
  });
});
it("distinguishes clean drafts, failures, stopped and pending courses", () => {
  const segments = courseRunSegments({
    ...run,
    finished: 40,
    published: 10,
    drafts: 5,
    review: 12,
    failed: 3,
    stopped: 10,
  });
  expect(segments).toEqual({
    published: 10,
    drafts: 5,
    review: 12,
    failed: 3,
    stopped: 10,
    other: 0,
    pending: 10,
  });
  expect(Object.values(segments).reduce((sum, count) => sum + count, 0)).toBe(
    50,
  );
});
it("never paints stopped work as successful or overflowing progress", () => {
  expect(
    courseRunSegments({
      ...run,
      state: "cancelled",
      published: 0,
      imported: 0,
      review: 0,
      stopped: 50,
    }).published,
  ).toBe(0);
  const segments = courseRunSegments({
    ...run,
    total: 2,
    finished: 2,
    review: 2,
    failed: 1,
  });
  expect(Object.values(segments).reduce((sum, count) => sum + count, 0)).toBe(
    2,
  );
});

it("calculates measured rates and costs without counting pending costs as free", () => {
  const analysis = courseRunAnalysis({
    ...run,
    started_at: "2026-10-03T00:00:00Z",
    completed_at: "2026-10-03T00:01:40Z",
    spent_usd: "0.0212",
  });
  expect(analysis.elapsedSeconds).toBe(100);
  expect(analysis.coursesPerMinute).toBe(30);
  expect(analysis.publicationRate).toBe(70);
  expect(analysis.reviewRate).toBe(30);
  expect(analysis.averageCost).toBeCloseTo(0.000424);
  expect(analysis.noChargeRate).toBe(74);
  expect(
    courseRunAnalysis({ ...run, paid_courses: 1, free_courses: 0 }).averageCost,
  ).toBe(0.02);
});

it("does not invent rates for an unstarted or empty run", () => {
  const analysis = courseRunAnalysis({
    ...run,
    total: 0,
    finished: 0,
    imported: 0,
    published: 0,
    paid_courses: 0,
    free_courses: 0,
  });
  expect(analysis.elapsedSeconds).toBeNull();
  expect(analysis.coursesPerMinute).toBeNull();
  expect(analysis.publicationRate).toBeNull();
  expect(analysis.averageCost).toBeNull();
});
