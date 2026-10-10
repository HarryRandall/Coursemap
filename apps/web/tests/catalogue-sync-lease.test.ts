import { expect, test } from "vitest";
import { CATALOGUE_SYNC_ADAPTERS } from "@/lib/catalogue-sync/process-sync";
import { compactCourseAdapter } from "@/lib/catalogue-import/kinds/course/compact-adapter";
import { compactStructureAdapter } from "@/lib/catalogue-import/kinds/structure/compact-adapter";
import { CATALOGUE_SYNC_LEASE_SECONDS } from "@/lib/catalogue-sync/sync-store";

// The longest source fetch: one 30 s course page request.
const SOURCE_FETCH_TIMEOUT_MS = 30_000;

test("a sync lease outlasts the longest stage so a live worker is never requeued", () => {
  const adapters = [
    ...CATALOGUE_SYNC_ADAPTERS,
    compactCourseAdapter,
    compactStructureAdapter,
  ];
  const longestStageMs = Math.max(
    SOURCE_FETCH_TIMEOUT_MS,
    ...adapters.map((adapter) => adapter.requestTimeoutMs),
  );
  // Leave at least a minute for the storage and database writes in a stage.
  expect(CATALOGUE_SYNC_LEASE_SECONDS * 1000).toBeGreaterThanOrEqual(
    longestStageMs + 60_000,
  );
});
