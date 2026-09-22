import assert from "node:assert/strict";
import { test } from "vitest";

import { publishedRecordTags } from "../lib/coursemap/published-cache.ts";

test("publishing a course drops every read a student could hit", () => {
  const tags = publishedRecordTags({
    kind: "course",
    academicYear: 2027,
    code: "comp2700",
  });
  assert.ok(tags.includes("published-course:2027:COMP2700"));
  // The directory and the year picker read the same publication state, so a
  // published course that never appears in the list is the same defect.
  assert.ok(tags.includes("published-courses:2027"));
  assert.ok(tags.includes("published-course-page"));
  assert.ok(tags.includes("published-course-years"));
});

test("publishing a structure drops the structure reads", () => {
  const tags = publishedRecordTags({
    kind: "major",
    academicYear: 2027,
    code: "csec-maj",
  });
  assert.deepEqual(tags, [
    "published-structure-detail",
    "published-structure:2027:CSEC-MAJ",
  ]);
});
