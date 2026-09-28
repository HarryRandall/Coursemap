import { beforeEach, expect, test, vi } from "vitest";
import { loadSocieties } from "@/lib/societies-data";

const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: (from: number, to: number) => readPage(table, from, to),
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

beforeEach(() => readPage.mockReset());

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
  expect(readPage).toHaveBeenCalledWith("society_events", 1000, 1999);
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
