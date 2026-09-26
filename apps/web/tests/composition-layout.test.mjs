import assert from "node:assert/strict";
import { test } from "vitest";

const { compositionLayout } =
  await import("../ui/dashboard/composition-layout.ts");

test("the largest section takes the left column and the rest stack by size", () => {
  const [major, core, electives] = compositionLayout([24, 84, 60], 600, 240);
  assert.deepEqual([core.x, core.y, core.height], [0, 0, 240]);
  assert.equal(electives.x, major.x);
  assert.equal(electives.y, 0);
  assert.equal(major.y, electives.height);
  assert.ok(electives.height > major.height);
});

test("with four sections the two largest each get a column", () => {
  const rects = compositionLayout([72, 36, 24, 12], 1440, 480);
  assert.equal(rects[0].x, 0);
  assert.equal(rects[1].height, 480);
  assert.equal(rects[2].x, rects[3].x);
});
