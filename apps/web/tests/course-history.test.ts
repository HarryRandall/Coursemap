import { expect, test } from "vitest";
import { courseHistoryEvents } from "@/lib/coursemap/course-history";

test("course history merges import versions and orders edits with unsuccessful attempts", () => {
  const imported = {
    id: "import",
    created_at: "2026-08-01T00:00:00Z",
    processing_status: "succeeded",
    review_status: "accepted",
    candidate_snapshot_id: 1,
    error_summary: null,
  };
  const version = {
    id: 1,
    createdAt: imported.created_at,
    origin: "import",
    sealedAt: imported.created_at,
    snapshotNumber: 1,
  };
  const events = courseHistoryEvents(
    [
      imported,
      {
        ...imported,
        id: "retry",
        created_at: "2026-08-03T00:00:00Z",
        processing_status: "failed",
        candidate_snapshot_id: null,
      },
    ],
    [
      version,
      {
        ...version,
        id: 2,
        snapshotNumber: 2,
        origin: "manual",
        createdAt: "2026-08-02T00:00:00Z",
      },
    ],
  );
  expect(events.map((event) => event.title)).toEqual([
    "Import failed",
    "Draft edited",
    "Imported from ANU",
  ]);
  expect(events.at(-1)?.version?.id).toBe(1);
});
