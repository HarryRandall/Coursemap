import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import type {
  CatalogueChangelog,
  ChangelogEntryView,
} from "@/lib/catalogue/changelog";
import { ChangelogTimeline } from "@/ui/admin/catalogue/changelog/changelog-timeline";

// Local dates, so the day grouping under test does not depend on the runner's
// time zone.
const TODAY = new Date(2026, 8, 22, 12, 0);
const TODAY_AT = new Date(2026, 8, 22, 10, 42).toISOString();
const TODAY_STARTED_AT = new Date(2026, 8, 22, 10, 38).toISOString();
const YESTERDAY_AT = new Date(2026, 8, 21, 15, 10).toISOString();
const PATH = "/admin/courses/2027/comp2700";

function entry(
  overrides: Partial<ChangelogEntryView> = {},
): ChangelogEntryView {
  return {
    id: "event-1",
    kind: "edit",
    at: TODAY_AT,
    startedAt: TODAY_STARTED_AT,
    actorId: "11111111-1111-4111-8111-111111111111",
    origin: "manual",
    eventIds: [5, 4, 3, 2, 1],
    versionId: null,
    fields: [
      {
        fieldPath: "course.details.description",
        label: "Description",
        oldValue: "Original",
        newValue: "Final",
      },
    ],
    usedFromSource: [],
    keptLocal: [],
    actorName: "Harry",
    versionOrdinal: null,
    sourceChanges: null,
    ...overrides,
  };
}

function renderTimeline(
  changelog: Partial<CatalogueChangelog>,
  ordinals = new Map<number, number>(),
) {
  return render(
    <ChangelogTimeline
      changelog={{ entries: [], shown: 0, hasMore: false, ...changelog }}
      path={PATH}
      today={TODAY}
      versionOrdinals={ordinals}
    />,
  );
}

test("an empty changelog says what will fill it", () => {
  renderTimeline({});
  expect(screen.getByText("Nothing has happened yet")).toBeTruthy();
});

test("an editing session reads as one entry with its autosave count", () => {
  renderTimeline({ entries: [entry()], shown: 1 });
  expect(screen.getByText("Harry edited Description")).toBeTruthy();
  expect(screen.getByText("5 autosaves over 4 minutes")).toBeTruthy();
  const details = screen.getByText("View change").closest("details");
  expect(details?.open).toBe(false);
  expect(within(details!).getByText("Original")).toBeTruthy();
  expect(within(details!).getByText("Final")).toBeTruthy();
});

test("entries are grouped under the day they happened", () => {
  renderTimeline({
    entries: [
      entry(),
      entry({
        id: "event-2",
        at: YESTERDAY_AT,
        startedAt: YESTERDAY_AT,
        kind: "publish",
        eventIds: [2],
        versionId: 14,
        versionOrdinal: 14,
        fields: [],
      }),
    ],
    shown: 2,
  });
  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText("Yesterday")).toBeTruthy();
  expect(screen.getByText("Published version 14")).toBeTruthy();
});

test("a version entry links to the version rather than printing a row id", () => {
  renderTimeline(
    {
      entries: [
        entry({
          kind: "publish",
          versionId: 87,
          versionOrdinal: 3,
          fields: [],
          eventIds: [9],
        }),
      ],
      shown: 1,
    },
    new Map([[87, 3]]),
  );
  const link = screen.getByRole("link", { name: "View version 3" });
  expect(link.getAttribute("href")).toBe(`${PATH}/changelog/3`);
  expect(screen.queryByText(/87/)).toBeNull();
});

test("a review entry names what was used and what was kept", () => {
  renderTimeline({
    entries: [
      entry({
        kind: "source_accepted",
        origin: "source",
        actorName: "Harry",
        eventIds: [7, 6],
        fields: [],
        usedFromSource: ["Offerings", "Learning outcomes"],
        keptLocal: ["Description"],
      }),
    ],
    shown: 1,
  });
  expect(screen.getByText("ANU changes reviewed")).toBeTruthy();
  expect(screen.getByText("Offerings, Learning outcomes")).toBeTruthy();
  expect(screen.getByText("Description")).toBeTruthy();
});

test("a sync entry counts the changes it found", () => {
  renderTimeline({
    entries: [
      entry({
        kind: "source_changed",
        origin: "source",
        actorName: null,
        eventIds: [3],
        fields: [],
        sourceChanges: { total: 3, conflicts: 1 },
      }),
    ],
    shown: 1,
  });
  expect(screen.getByText("ANU changes found")).toBeTruthy();
  expect(screen.getByText("3 changes to review, 1 conflict")).toBeTruthy();
  expect(screen.getByText("ANU sync")).toBeTruthy();
});

test("a long history offers the rest of itself", () => {
  renderTimeline({ entries: [entry()], shown: 40, hasMore: true });
  const link = screen.getByRole("link", { name: "Show earlier history" });
  expect(link.getAttribute("href")).toBe(`${PATH}/changelog?events=80`);
});
