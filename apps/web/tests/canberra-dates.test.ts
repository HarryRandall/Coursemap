import { afterEach, expect, test, vi } from "vitest";
import {
  ACADEMIC_TIME_ZONE,
  canberraTodayIso,
  formatCanberraDateTime,
} from "@/lib/canberra-format";
import { currentDashboardTermId } from "@/lib/coursemap/dashboard-series";

const term = {
  id: "2026-s2",
  year: 2026,
  name: "Second Semester",
  shortName: "Semester 2",
  dates: "",
  startsOn: "2026-07-27",
  endsOn: "2026-10-30",
};
test.each([
  ["2026-10-03T13:59:59Z", "2026-10-03"],
  ["2026-10-03T14:00:00Z", "2026-10-04"],
  ["2026-10-03T15:59:59Z", "2026-10-04"],
  ["2026-10-03T16:00:00Z", "2026-10-04"],
  ["2026-10-04T12:59:59Z", "2026-10-04"],
  ["2026-10-04T13:00:00Z", "2026-10-05"],
])("Sydney calendar date at %s is %s", (instant, day) => {
  expect(ACADEMIC_TIME_ZONE).toBe("Australia/Sydney");
  expect(canberraTodayIso(new Date(instant))).toBe(day);
});
test("Canberra formatting observes the spring clock change", () => {
  expect(formatCanberraDateTime("2026-10-03T15:59:00Z")).toMatch(
    /4 Oct.*1:59 am/,
  );
  expect(formatCanberraDateTime("2026-10-03T16:00:00Z")).toMatch(
    /4 Oct.*3:00 am/,
  );
});
test.each([
  ["2026-07-26T13:59:59Z", undefined],
  ["2026-07-26T14:00:00Z", "2026-s2"],
  ["2026-10-30T12:59:59Z", "2026-s2"],
  ["2026-10-30T13:00:00Z", undefined],
])("the current term follows the Sydney day at %s", (instant, id) => {
  expect(
    currentDashboardTermId([term], canberraTodayIso(new Date(instant))),
  ).toBe(id);
});

afterEach(() => vi.useRealTimers());
test.each([
  ["2026-07-26T14:00:00Z", "2026-s2"],
  ["2026-10-30T13:00:00Z", undefined],
])("the default dashboard term uses Sydney's day at %s", (instant, id) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  expect(currentDashboardTermId([term])).toBe(id);
});
