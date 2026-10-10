import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import type {
  CatalogueChangelog,
  ChangelogEntryView,
} from "@/lib/catalogue/changelog";
import { ChangelogTimeline } from "@/ui/admin/catalogue/changelog/changelog-timeline";

// Fixtures name Canberra instants explicitly in either runner time zone.
const TODAY = new Date("2026-09-22T12:00:00+10:00");
const TODAY_AT = "2026-09-22T10:42:00+10:00";
const TODAY_STARTED_AT = "2026-09-22T10:38:00+10:00";
const YESTERDAY_AT = "2026-09-21T15:10:00+10:00";
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

test("Sydney midnight groups Today and Yesterday across the DST change", () => {
  render(
    <ChangelogTimeline
      changelog={{
        entries: [
          entry({
            id: "today",
            at: "2026-10-04T13:05:00Z",
            startedAt: "2026-10-04T13:05:00Z",
          }),
          entry({
            id: "yesterday",
            at: "2026-10-04T12:55:00Z",
            startedAt: "2026-10-04T12:55:00Z",
          }),
        ],
        shown: 2,
        hasMore: false,
      }}
      path={PATH}
      today={new Date("2026-10-04T13:10:00Z")}
      versionOrdinals={new Map()}
    />,
  );
  expect(
    screen.getByRole("list", { name: "Changelog for Today" }).children,
  ).toHaveLength(1);
  expect(
    screen.getByRole("list", { name: "Changelog for Yesterday" }).children,
  ).toHaveLength(1);
});
