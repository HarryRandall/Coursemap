import { beforeEach, expect, test, vi } from "vitest";
import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { reviewValueHash } from "@/lib/catalogue/source-review";

const { sql, rows } = vi.hoisted(() => ({
  sql: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/catalogue-sync/sync-store.ts", () => ({
  withSyncDatabaseClient: (read: (client: unknown) => unknown) => read(sql),
}));
import {
  loadSourceReview,
  countBlockingFirstReads,
} from "@/lib/catalogue/source-review-store";

beforeEach(() => {
  sql.mockReset();
  rows.length = 0;
  sql.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    // Represent the production timeout on a review that joins every wide row.
    if (query.includes("changes.*")) throw new Error("statement timeout");
    return rows;
  });
});

test("loads open and decided review units after resolving one current source version", async () => {
  const draft = emptyCatalogueContent({
    kind: "course",
    code: "COMP1100",
    academicYear: 2026,
    title: "Programming",
  });
  const base = {
    sync_id: "sync",
    source_version_id: 3,
    previous_source_version_id: 2,
    created_at: "2026-10-10T00:00:00Z",
    review_unit_kind: "scalar",
    classification: "source_change",
    base_source_value: "Old",
    local_value: null,
    incoming_source_value: "New",
    local_value_hash: reviewValueHash(null),
    confidence: 0.9,
    review_band: null,
    review_reason: null,
    resolved_at: null,
  };
  rows.push(
    {
      ...base,
      id: 1,
      field_path: "course.details.description",
      decision: null,
    },
    {
      ...base,
      id: 2,
      field_path: "course.details.title",
      decision: "keep_local",
      resolved_at: "2026-10-10T00:01:00Z",
    },
  );
  const review = await loadSourceReview(42, draft);
  expect(review?.syncId).toBe("sync");
  expect(review?.sourceVersionId).toBe(3);
  expect(review?.resolved.map((change) => change.id)).toEqual([2]);
  expect(
    [...(review?.incoming ?? []), ...(review?.conflicts ?? [])].map(
      (change) => change.id,
    ),
  ).toContain(1);
  const query = sql.mock.calls[0]?.[0].join("?");
  expect(query).toContain("limit 1");
  expect(query).toContain("materialized");
  expect(query).toContain("changes.superseded_at is null");
});

test("an empty review remains null", async () => {
  expect(await loadSourceReview(42, null)).toBeNull();
});

test("blocking first reads retain strict and ordinary publication semantics", async () => {
  sql.mockResolvedValue([{ count: 2 }]);
  expect(await countBlockingFirstReads(sql as never, 42)).toBe(2);
  expect(await countBlockingFirstReads(sql as never, 42, true)).toBe(2);
  expect(sql.mock.calls.map((call) => call.slice(1))).toEqual([
    [42, false],
    [42, true],
  ]);
});
