import { expect, test } from "vitest";
import {
  CATALOGUE_STATES,
  CATALOGUE_STATE_LABELS,
  type CatalogueDirectoryRecord,
  catalogueRecordState,
} from "@/lib/coursemap/catalogue-kinds";

function record(
  overrides: Partial<CatalogueDirectoryRecord> = {},
): CatalogueDirectoryRecord {
  return {
    code: "INFS1001",
    title: "Introduction",
    summary: {},
    recordId: 1,
    hasDraft: false,
    hasChanges: false,
    draftRevision: null,
    isPublished: false,
    isListedByAnu: true,
    lastSeenAt: null,
    sourceState: "up_to_date",
    openChangeCount: 0,
    conflictCount: 0,
    latestSync: null,
    ...overrides,
  };
}

test("reports the most urgent fact about a record, in that order", () => {
  expect(
    catalogueRecordState(
      record({
        sourceState: "sync_failed",
        isListedByAnu: false,
        hasDraft: true,
        isPublished: true,
      }),
    ),
  ).toBe("sync_failed");
  expect(
    catalogueRecordState(
      record({ isListedByAnu: false, hasDraft: true, isPublished: true }),
    ),
  ).toBe("delisted");
  expect(catalogueRecordState(record({ sourceState: "syncing" }))).toBe(
    "syncing",
  );
  expect(
    catalogueRecordState(
      record({
        sourceState: "changes_available",
        openChangeCount: 2,
        hasDraft: true,
      }),
    ),
  ).toBe("changes_available");
  // Unpublished work outranks publication: that record still needs a person.
  expect(
    catalogueRecordState(record({ hasDraft: true, isPublished: true })),
  ).toBe("draft");
  expect(catalogueRecordState(record({ isPublished: true }))).toBe("published");
  expect(catalogueRecordState(record())).toBe("unpublished");
});

test("treats a sync that found nothing outstanding as settled", () => {
  expect(
    catalogueRecordState(
      record({
        sourceState: "changes_available",
        openChangeCount: 0,
        isPublished: true,
      }),
    ),
  ).toBe("published");
});

test("offers every state the directory can be narrowed to a name", () => {
  expect(CATALOGUE_STATES).toEqual(Object.keys(CATALOGUE_STATE_LABELS));
  for (const state of CATALOGUE_STATES)
    expect(CATALOGUE_STATE_LABELS[state]).toBeTruthy();
});
