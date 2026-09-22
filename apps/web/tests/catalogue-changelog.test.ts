import assert from "node:assert/strict";
import { test } from "vitest";

import {
  type ChangelogEvent,
  editingSessionSummary,
  groupChangelogEvents,
} from "../lib/catalogue/changelog.ts";

const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HARRY = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";

function event(
  overrides: Partial<ChangelogEvent> & { id: number },
): ChangelogEvent {
  return {
    eventKind: "edit",
    origin: "manual",
    actorId: HARRY,
    editingSessionId: SESSION,
    versionId: null,
    syncChangeId: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    fields: [],
    decision: null,
    ...overrides,
  };
}

function edit(
  id: number,
  minute: number,
  from: string,
  to: string,
  extra?: Partial<ChangelogEvent>,
) {
  return event({
    id,
    createdAt: `2026-09-21T10:${String(minute).padStart(2, "0")}:00.000Z`,
    fields: [
      { fieldPath: "course.details.description", oldValue: from, newValue: to },
    ],
    ...extra,
  });
}

test("one editing session reads as one entry from its first to its last value", () => {
  // Newest first, as the loader supplies them.
  const entries = groupChangelogEvents([
    edit(5, 4, "Fourth", "Final"),
    edit(4, 3, "Third", "Fourth"),
    edit(3, 2, "Second", "Third"),
    edit(2, 1, "First", "Second"),
    edit(1, 0, "Original", "First"),
  ]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0]!.eventIds, [5, 4, 3, 2, 1]);
  assert.deepEqual(entries[0]!.fields, [
    {
      fieldPath: "course.details.description",
      label: "Description",
      oldValue: "Original",
      newValue: "Final",
    },
  ]);
  assert.equal(
    editingSessionSummary(entries[0]!),
    "5 autosaves over 4 minutes",
  );
});

test("a value typed and taken back again is not a change", () => {
  const entries = groupChangelogEvents([
    edit(2, 1, "Tried something", "Original"),
    edit(1, 0, "Original", "Tried something"),
  ]);
  assert.deepEqual(entries[0]!.fields, []);
});

test("separate sessions and separate people stay separate", () => {
  const entries = groupChangelogEvents([
    edit(3, 9, "B", "C", { editingSessionId: OTHER_SESSION }),
    edit(2, 5, "A", "B", { actorId: SAM }),
    edit(1, 0, "Start", "A"),
  ]);
  assert.equal(entries.length, 3);
  assert.equal(editingSessionSummary(entries[0]!), null);
});

test("decisions taken in one sitting read as one review", () => {
  const entries = groupChangelogEvents([
    event({
      id: 3,
      eventKind: "source_kept",
      origin: "source",
      editingSessionId: null,
      createdAt: "2026-09-21T10:12:00.000Z",
      syncChangeId: 12,
      decision: {
        fieldPath: "course.details.description",
        decision: "keep_local",
      },
    }),
    event({
      id: 2,
      eventKind: "source_accepted",
      origin: "source",
      editingSessionId: null,
      createdAt: "2026-09-21T10:10:00.000Z",
      syncChangeId: 11,
      decision: {
        fieldPath: "course.learningOutcomes",
        decision: "use_source",
      },
      fields: [
        { fieldPath: "course.learningOutcomes", oldValue: [], newValue: [{}] },
      ],
    }),
    event({
      id: 1,
      eventKind: "source_accepted",
      origin: "source",
      editingSessionId: null,
      createdAt: "2026-09-21T09:00:00.000Z",
      syncChangeId: 10,
      decision: { fieldPath: "course.fees", decision: "use_source" },
    }),
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0]!.usedFromSource, ["Learning outcomes"]);
  assert.deepEqual(entries[0]!.keptLocal, ["Description"]);
  assert.deepEqual(entries[1]!.usedFromSource, ["Fees"]);
});

test("quiet ANU checks collapse instead of filling the timeline", () => {
  const entries = groupChangelogEvents([
    event({
      id: 3,
      eventKind: "source_checked",
      origin: "source",
      actorId: null,
      editingSessionId: null,
    }),
    event({
      id: 2,
      eventKind: "source_checked",
      origin: "source",
      actorId: null,
      editingSessionId: null,
    }),
    event({
      id: 1,
      eventKind: "source_checked",
      origin: "source",
      actorId: null,
      editingSessionId: null,
    }),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.eventIds.length, 3);
});

test("publication and lifecycle events always stand alone", () => {
  const entries = groupChangelogEvents([
    event({
      id: 4,
      eventKind: "restore",
      versionId: 40,
      editingSessionId: null,
    }),
    event({
      id: 3,
      eventKind: "discard",
      versionId: 30,
      editingSessionId: null,
    }),
    event({
      id: 2,
      eventKind: "unpublish",
      versionId: 20,
      editingSessionId: null,
    }),
    event({
      id: 1,
      eventKind: "publish",
      versionId: 10,
      editingSessionId: null,
    }),
  ]);
  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.versionId]),
    [
      ["restore", 40],
      ["discard", 30],
      ["unpublish", 20],
      ["publish", 10],
    ],
  );
});
