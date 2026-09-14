import { expect, test } from "vitest";
import { courseReviewSnapshotId } from "@/lib/coursemap/course-review-snapshot";

const input = {
  activeSnapshotId: null,
  availableSnapshotIds: [1, 2, 3],
  pendingSnapshotIds: [3, 2],
};

test("a first import is reviewable before a draft has been accepted", () => {
  expect(courseReviewSnapshotId(input)).toBe(3);
});

test("pending re-imports do not replace an existing working draft", () => {
  expect(courseReviewSnapshotId({ ...input, activeSnapshotId: 1 })).toBe(1);
});

test("an explicitly selected historical version remains inspectable", () => {
  expect(courseReviewSnapshotId({ ...input, requestedSnapshotId: 2 })).toBe(2);
});

test("missing versions and non-pending imports never become the default", () => {
  expect(
    courseReviewSnapshotId({
      ...input,
      requestedSnapshotId: 99,
      pendingSnapshotIds: [99, 2],
    }),
  ).toBe(2);
  expect(
    courseReviewSnapshotId({ ...input, pendingSnapshotIds: [] }),
  ).toBeNull();
});
