import { beforeEach, expect, test, vi } from "vitest";
import {
  loadSocieties,
  loadSocietyProfile,
  loadSocietyEvent,
  loadSocietiesForYear,
  loadUpcomingSocieties,
} from "@/lib/societies-data";

const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, string, unknown]> = [];
      const filter = (operator: string, column: string, value: unknown) => {
        filters.push([operator, column, value]);
        return query;
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => filter("eq", column, value),
        in: (column: string, value: unknown) => filter("in", column, value),
        gte: (column: string, value: unknown) => filter("gte", column, value),
        gt: (column: string, value: unknown) => filter("gt", column, value),
        lt: (column: string, value: unknown) => filter("lt", column, value),
        order: () => query,
        range: (from: number, to: number) => readPage(table, from, to, filters),
      };
      return query;
    },
  }),
}));

const club = {
  id: "club",
  slug: "club",
  name: "Club",
  short_name: "Club",
  category: "Academic",
  summary: "Club summary",
  overview: "Club overview",
  interests: [],
  website_url: null,
  logo_url: null,
  instagram_url: null,
  facebook_url: null,
  discord_url: null,
  source_url: "https://example.test/club",
};
const event = {
  id: "event",
  society_id: "club",
  source_id: "1",
  category: "social",
  title: "Event",
  starts_at: "2026-09-28T12:00:00Z",
  ends_at: "2026-09-28T14:00:00Z",
  location: "Campus",
  source_url: "https://example.test/event",
  description: "",
  artwork_url: null,
  tickets_url: null,
};

beforeEach(() => {
  readPage.mockReset();
});

test("public reads include clubs and events beyond the database's first page", async () => {
  readPage.mockImplementation(
    async (table: string, from: number, to: number) => {
      const rows = Array.from({ length: 1001 }, (_, index) =>
        table === "societies"
          ? { ...club, id: `club-${index}`, slug: `club-${index}` }
          : { ...event, id: `event-${index}`, society_id: `club-${index}` },
      );
      return { data: rows.slice(from, to + 1), error: null };
    },
  );
  const result = await loadSocieties();
  expect(result.societies).toHaveLength(1001);
  expect(result.events).toHaveLength(1001);
  expect(result.events[1000]).toMatchObject({
    id: "event-1000",
    societySlug: "club-1000",
    description: "Club summary",
  });
  expect(readPage).toHaveBeenCalledWith("society_events", 1000, 1999, [
    ["eq", "status", "published"],
  ]);
});

test("a later failed page reports unavailable data rather than a partial directory", async () => {
  readPage.mockImplementation(async (table: string, from: number) => ({
    data:
      table === "societies" && from === 0
        ? Array.from({ length: 1000 }, () => club)
        : [],
    error: from === 1000 ? new Error("Database unavailable") : null,
  }));
  await expect(loadSocieties()).rejects.toThrow(
    "The society directory could not be loaded.",
  );
});

test("events from a hidden organiser are omitted from the public directory", async () => {
  readPage.mockImplementation(async (table: string) => ({
    data: table === "society_events" ? [event] : [],
    error: null,
  }));
  expect(await loadSocieties()).toEqual({ societies: [], events: [] });
});

function publishedRows(clubs = [club], events = [event]) {
  readPage.mockImplementation(
    async (
      table: string,
      from: number,
      to: number,
      filters: Array<[string, string, unknown]>,
    ) => {
      const rows = (table === "societies"
        ? clubs
        : events) as unknown as Record<string, unknown>[];
      return {
        data: rows
          .filter((row) =>
            filters.every(([operator, column, value]) => {
              if (column === "status") return true;
              const actual = row[column];
              if (operator === "in")
                return (value as unknown[]).includes(actual);
              if (operator === "eq") return actual === value;
              const comparison = String(actual).localeCompare(String(value));
              return operator === "gt"
                ? comparison > 0
                : operator === "gte"
                  ? comparison >= 0
                  : comparison < 0;
            }),
          )
          .slice(from, to + 1),
        error: null,
      };
    },
  );
}

test("a society profile reads only that organiser's events", async () => {
  publishedRows(
    [club, { ...club, id: "other", slug: "other" }],
    [event, { ...event, id: "other-event", society_id: "other" }],
  );
  const result = await loadSocietyProfile("club");
  expect(result.societies.map((society) => society.slug)).toEqual(["club"]);
  expect(result.events.map((listing) => listing.id)).toEqual(["event"]);
  expect(readPage.mock.calls[1][3]).toContainEqual([
    "in",
    "society_id",
    ["club"],
  ]);
});

test("a missing society does not scan the events table", async () => {
  publishedRows();
  expect(await loadSocietyProfile("missing")).toEqual({
    societies: [],
    events: [],
  });
  expect(readPage).toHaveBeenCalledTimes(1);
});

test("a canonical event reads only its organiser, with no legacy lookup", async () => {
  const id = "00000000-0000-0000-0000-000000000001";
  publishedRows(
    [club, { ...club, id: "other", slug: "other" }],
    [{ ...event, id }],
  );
  expect(await loadSocietyEvent(id)).toMatchObject({ id, societySlug: "club" });
  expect(readPage).toHaveBeenCalledTimes(2);
  expect(readPage.mock.calls[0][3]).toContainEqual(["eq", "id", id]);
  expect(readPage.mock.calls[1][3]).toContainEqual(["in", "id", ["club"]]);
});

test("legacy event identifiers resolve without a full event scan", async () => {
  publishedRows();
  expect(await loadSocietyEvent("1")).toMatchObject({ id: "event" });
  expect(readPage.mock.calls[0][3]).toContainEqual(["eq", "source_id", "1"]);
  expect(readPage).toHaveBeenCalledTimes(2);
});

test("year-scoped events retain the Canberra new-year boundaries", async () => {
  publishedRows(
    [club],
    [
      { ...event, id: "before", starts_at: "2025-12-31T12:59:59Z" },
      { ...event, id: "start", starts_at: "2025-12-31T13:00:00Z" },
      { ...event, id: "end", starts_at: "2026-12-31T12:59:59Z" },
      { ...event, id: "after", starts_at: "2026-12-31T13:00:00Z" },
    ],
  );
  expect(
    (await loadSocietiesForYear(2026)).events.map((listing) => listing.id),
  ).toEqual(["start", "end"]);
});

test("landing society choices retain clubs without events and omit finished events", async () => {
  publishedRows([club, { ...club, id: "other", slug: "other" }], [event]);
  const result = await loadUpcomingSocieties("2026-09-28T14:00:00Z");
  expect(result.societies).toHaveLength(2);
  expect(result.events).toEqual([]);
  expect(readPage.mock.calls[1][3]).toContainEqual([
    "gt",
    "ends_at",
    "2026-09-28T14:00:00Z",
  ]);
});

test("a UUID-shaped legacy identifier falls back only after a missing canonical event", async () => {
  const sourceId = "00000000-0000-0000-0000-000000000002";
  publishedRows([club], [{ ...event, source_id: sourceId }]);
  expect(await loadSocietyEvent(sourceId)).toMatchObject({ id: "event" });
  expect(readPage.mock.calls[0][3]).toContainEqual(["eq", "id", sourceId]);
  expect(readPage.mock.calls[1][3]).toContainEqual([
    "eq",
    "source_id",
    sourceId,
  ]);
  expect(readPage).toHaveBeenCalledTimes(3);
});

test("scoped event reads exclude hidden organisers and do not swallow database errors", async () => {
  publishedRows([], [event]);
  expect(await loadSocietyEvent("1")).toBeNull();
  readPage.mockResolvedValue({
    data: null,
    error: new Error("Database unavailable"),
  });
  await expect(loadSocietyEvent("1")).rejects.toThrow(
    "The society directory could not be loaded.",
  );
});
