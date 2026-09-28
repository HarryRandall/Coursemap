import { expect, test } from "vitest";
import snapshot from "@/scripts/societies/data/anu-2026-09-28.json";
import { societyEventDay, societyKeyDates } from "@/lib/society-calendar";
import { EXAMPLE_SOCIETY_EVENTS } from "@/tests/fixtures/societies";

test("the public snapshot contains 20 events and a profile for every organiser", () => {
  expect(snapshot.events).toHaveLength(20);
  expect(snapshot.societies).toHaveLength(23);
  expect(new Set(snapshot.events.map((event) => event.sourceId)).size).toBe(20);
  expect(new Set(snapshot.events.map((event) => event.id)).size).toBe(20);
  for (const event of snapshot.events) {
    const club = snapshot.societies.find(
      (item) => item.slug === event.societySlug,
    );
    expect(club?.name).toBe(event.host);
    expect(club?.directoryUrl).toBe(event.hostProfileUrl);
    expect(Date.parse(event.endsAt)).toBeGreaterThan(
      Date.parse(event.startsAt),
    );
    expect(event.id).toMatch(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    expect(event.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  }
  for (const original of EXAMPLE_SOCIETY_EVENTS) {
    expect(
      snapshot.events.find((event) => event.sourceId === original.sourceId)?.id,
    ).toBe(original.id);
  }
});

test("society key dates use Canberra dates across midnight and daylight saving", () => {
  expect(societyEventDay("2026-09-29T14:30:00Z")).toBe("2026-09-30");
  expect(societyEventDay("2026-10-04T13:30:00Z")).toBe("2026-10-05");
  const dates = societyKeyDates(EXAMPLE_SOCIETY_EVENTS, 2026);
  expect(dates).toHaveLength(3);
  expect(dates[0]).toMatchObject({
    category: "societies",
    date: "2026-09-29",
    href: `/societies/events/${EXAMPLE_SOCIETY_EVENTS[0]!.id}`,
  });
  expect(societyKeyDates(EXAMPLE_SOCIETY_EVENTS, 2027)).toEqual([]);
});
