import assert from "node:assert/strict";
import { test } from "vitest";

import {
  formatBytes,
  formatCost,
  formatDuration,
  syncStatusLabel,
  syncStatusTone,
} from "../ui/admin/operations/operations-format.ts";

test("durations read at the scale they happened on", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(340), "340 ms");
  assert.equal(formatDuration(1500), "1.5 s");
  assert.equal(formatDuration(95_000), "1m 35s");
});

test("a fraction of a cent is still reported, because budgets are the point", () => {
  assert.equal(formatCost(0), "—");
  assert.equal(formatCost(0.0031), "US$0.0031");
  assert.equal(formatCost(1.5), "US$1.50");
});

test("artefact sizes read in the unit that fits", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(900), "900 B");
  assert.equal(formatBytes(2048), "2.0 kB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("a failed sync reads as a failure and an unknown status is not dressed up", () => {
  assert.equal(syncStatusTone("failed"), "danger");
  assert.equal(syncStatusTone("review_required"), "warning");
  assert.equal(syncStatusTone("unchanged"), "success");
  assert.equal(syncStatusTone("something_new"), "neutral");
  assert.equal(syncStatusLabel("review_required"), "review required");
});
