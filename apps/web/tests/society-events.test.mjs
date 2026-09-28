import { expect, test } from "vitest";
import { upcomingSocietyEvents } from "@/lib/society-events";
import { EXAMPLE_SOCIETY_EVENTS } from "@/tests/fixtures/societies";

test("upcoming events expire after their end and profiles only show their own society", () => {
  const duringMixer = new Date("2026-09-29T19:00:00+10:00");
  expect(
    upcomingSocietyEvents(
      EXAMPLE_SOCIETY_EVENTS,
      duringMixer,
      "computer-science-students-association",
    ).map((event) => event.sourceId),
  ).toEqual(["73879"]);
  expect(
    upcomingSocietyEvents(
      EXAMPLE_SOCIETY_EVENTS,
      new Date("2026-09-29T20:00:00+10:00"),
      "computer-science-students-association",
    ),
  ).toEqual([]);
  expect(
    upcomingSocietyEvents(EXAMPLE_SOCIETY_EVENTS, duringMixer, "chess-society"),
  ).toEqual([]);
  expect(
    upcomingSocietyEvents(EXAMPLE_SOCIETY_EVENTS, duringMixer).map(
      (event) => event.sourceId,
    ),
  ).toEqual(["83324", "73879", "72410"]);
});

test("local event identifiers are unique UUIDs and retain their source identifiers", () => {
  expect(new Set(EXAMPLE_SOCIETY_EVENTS.map((event) => event.id)).size).toBe(
    EXAMPLE_SOCIETY_EVENTS.length,
  );
  for (const event of EXAMPLE_SOCIETY_EVENTS) {
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(new URL(event.sourceUrl).searchParams.get("eid")).toBe(
      event.sourceId,
    );
  }
});
