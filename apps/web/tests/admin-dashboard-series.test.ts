import { describe, expect, it } from "vitest";
import {
  canberraDay,
  countByDay,
  cumulativeByWeek,
  distinctActorsByWeek,
  recentDays,
  recentWeeks,
  shortDayLabel,
  weekStart,
} from "../lib/admin/dashboard-series";

describe("admin dashboard series", () => {
  it("buckets instants by the Canberra calendar day", () => {
    // 11pm UTC on 6 October is already 7 October in Canberra (AEDT, +11).
    expect(canberraDay("2026-10-06T23:00:00Z")).toBe("2026-10-07");
    expect(canberraDay("2026-10-06T12:00:00Z")).toBe("2026-10-06");
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
  });

  it("lists recent days and weeks oldest first", () => {
    const now = new Date("2026-10-07T02:00:00Z");
    expect(recentDays(now, 3)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(recentWeeks(now, 2)).toEqual(["2026-09-28", "2026-10-05"]);
  });

  it("counts by day and ignores timestamps outside the window", () => {
    expect(
      countByDay(
        [
          "2026-10-06T01:00:00Z",
          "2026-10-06T02:00:00Z",
          "2026-09-01T00:00:00Z",
        ],
        ["2026-10-05", "2026-10-06"],
      ),
    ).toEqual([
      { day: "2026-10-05", count: 0 },
      { day: "2026-10-06", count: 2 },
    ]);
  });

  it("carries earlier accounts into the first cumulative week", () => {
    expect(
      cumulativeByWeek(
        [
          "2026-01-01T00:00:00Z",
          "2026-10-01T00:00:00Z",
          "2026-10-06T00:00:00Z",
        ],
        ["2026-09-28", "2026-10-05"],
      ),
    ).toEqual([2, 3]);
  });

  it("counts each actor once per week", () => {
    expect(
      distinctActorsByWeek(
        [
          { actorId: "a", at: "2026-10-05T01:00:00Z" },
          { actorId: "a", at: "2026-10-06T01:00:00Z" },
          { actorId: "b", at: "2026-10-06T01:00:00Z" },
          { actorId: "a", at: "2026-09-29T01:00:00Z" },
        ],
        ["2026-09-28", "2026-10-05"],
      ),
    ).toEqual([1, 2]);
  });

  it("formats short day labels", () => {
    expect(shortDayLabel("2026-10-06")).toBe("6 Oct");
  });
});
