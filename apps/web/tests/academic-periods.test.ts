import { expect, test } from "vitest";
import {
  academicPeriodDates,
  academicPeriodTerm,
  isSemesterTerm,
  sessionShortName,
} from "@/lib/coursemap/academic-periods";

test("undated periods remain usable without rendering an epoch date", () => {
  expect(academicPeriodDates(null, null)).toBe("Calendar dates pending");
  expect(
    academicPeriodTerm({
      calendar_year: 2026,
      code: "WINTER",
      name: "Winter Session",
      short_name: "Winter",
      starts_on: null,
      ends_on: null,
      sort_order: 20,
    }),
  ).toEqual({
    id: "2026-winter",
    year: 2026,
    name: "Winter Session",
    shortName: "Winter",
    dates: "Calendar dates pending",
    startsOn: undefined,
    endsOn: undefined,
    sortOrder: 20,
  });
});

test("published calendar bounds are formatted without a local timezone shift", () => {
  expect(academicPeriodDates("2026-07-01", "2026-09-30")).toBe(
    "1 July to 30 Sept",
  );
});

test("only First and Second Semester are standard semesters", () => {
  expect(isSemesterTerm({ id: "2026-s1" })).toBe(true);
  expect(isSemesterTerm({ id: "2026-s2" })).toBe(true);
  expect(isSemesterTerm({ id: "2026-summer" })).toBe(false);
  expect(isSemesterTerm({ id: "unscheduled" })).toBe(false);
});

test("course sessions shorten to the planner's labels", () => {
  expect(sessionShortName("First Semester")).toBe("S1");
  expect(sessionShortName("Second Semester")).toBe("S2");
  expect(sessionShortName("Summer Session")).toBe("Summer");
  expect(sessionShortName("Semester 1")).toBe("S1");
  expect(sessionShortName("Intensive Session")).toBe("Intensive");
});
