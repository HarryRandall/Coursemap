import { expect, test } from "vitest";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";

test("a sync is compared with the published dates students see", () => {
  const diff = diffUniversityCalendarReview(
    [
      { date: "2027-02-22", title: "Semester 1 begins" },
      { date: "2027-06-03", title: "Examination period begins" },
      { date: "2027-02-22", title: "Semester 1 begins" },
    ],
    [
      { date: "2027-02-22", title: "Semester 1 begins" },
      { date: "2027-03-31", title: "Census date" },
    ],
  );

  expect(diff).toMatchObject({ added: 1, removed: 1, unchanged: 1 });
  expect(
    diff.events.map(({ date, title, change, category }) => [
      date,
      title,
      change,
      category,
    ]),
  ).toEqual([
    ["2027-02-22", "Semester 1 begins", "unchanged", "teaching"],
    ["2027-03-31", "Census date", "removed", "enrolment"],
    ["2027-06-03", "Examination period begins", "added", "examinations"],
  ]);
});

test("a renamed date reads as one removal and one addition", () => {
  const diff = diffUniversityCalendarReview(
    [{ date: "2027-04-02", title: "Good Friday public holiday" }],
    [{ date: "2027-04-02", title: "Good Friday" }],
  );

  expect(diff.events.map((event) => event.change)).toEqual([
    "removed",
    "added",
  ]);
});

test("a first sync adds every date", () => {
  const diff = diffUniversityCalendarReview(
    [{ date: "2027-02-22", title: "Semester 1 begins" }],
    [],
  );

  expect(diff).toMatchObject({ added: 1, removed: 0, unchanged: 0 });
});

test("dates added by hand survive a sync that does not list them", () => {
  const diff = diffUniversityCalendarReview(
    [{ date: "2027-02-22", title: "Semester 1 begins" }],
    [
      { id: 1, date: "2027-02-22", title: "Semester 1 begins", origin: "anu" },
      { id: 2, date: "2027-05-01", title: "Open day", origin: "manual" },
    ],
  );

  expect(diff).toMatchObject({ added: 0, removed: 0, unchanged: 2 });
  expect(diff.events[1]).toMatchObject({
    title: "Open day",
    manual: true,
    eventId: 2,
  });
});
