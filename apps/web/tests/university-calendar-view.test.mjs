import assert from "node:assert/strict";

import { test } from "vitest";

const {
  UNIVERSITY_CALENDAR_CATEGORIES,
  categoriseUniversityCalendarEvent,
  decorateUniversityCalendarEvents,
  groupUniversityCalendarEventsByMonth,
  upcomingUniversityCalendarEvents,
  keyDatesAround,
  daysBetween,
} = await import("../lib/coursemap/university-calendar.ts");

test("categorises real calendar titles with the ordered keyword rules", () => {
  const expectations = [
    ["Semester 1 begins", "teaching"],
    ["Last day to add Semester 1 courses on ANUHub", "enrolment"],
    ["Semester 1 census date", "enrolment"],
    [
      "Due date for payment of tuition fees and up-front HECS for Semester 1",
      "enrolment",
    ],
    [
      "Semester 2 of prior year deferred and supplementary final examination period begins",
      "examinations",
    ],
    ["Results from Semester 1 published", "examinations"],
    ["2026 Graduations", "graduation"],
    ["New Year's Day public holiday", "holiday"],
    ["University offices re-open", "holiday"],
    ["ANU Open Day", "campus"],
    ["ANU Orientation Week", "teaching"],
    [
      "Recommended date to re-enrol in courses for the academic year",
      "enrolment",
    ],
  ];
  for (const [title, category] of expectations) {
    assert.equal(
      categoriseUniversityCalendarEvent(title),
      category,
      `"${title}" should be ${category}`,
    );
  }
});

test("keeps the six categories ordered with sentence-case labels", () => {
  assert.deepEqual(UNIVERSITY_CALENDAR_CATEGORIES, [
    { value: "teaching", label: "Teaching" },
    { value: "examinations", label: "Examinations" },
    { value: "enrolment", label: "Enrolment and fees" },
    { value: "graduation", label: "Graduation" },
    { value: "holiday", label: "Holidays" },
    { value: "campus", label: "Campus" },
  ]);
});

test("decorates records with categories and sorts by date then title", () => {
  const decorated = decorateUniversityCalendarEvents([
    { id: 1, date: "2026-07-20", title: "Semester 2 begins" },
    { id: 2, date: "2026-02-23", title: "Semester 1 begins" },
    { id: 3, date: "2026-02-23", title: "ANU Open Day" },
    { id: 4, date: "2026-03-31", title: "Semester 1 census date" },
  ]);

  assert.deepEqual(
    decorated.map(({ id, category }) => ({ id, category })),
    [
      { id: 3, category: "campus" },
      { id: 2, category: "teaching" },
      { id: 4, category: "enrolment" },
      { id: 1, category: "teaching" },
    ],
  );
});

test("groups events into chronological months with readable labels", () => {
  const events = decorateUniversityCalendarEvents([
    { id: 1, date: "2026-12-11", title: "2026 Graduations" },
    { id: 2, date: "2026-01-01", title: "New Year's Day public holiday" },
    { id: 3, date: "2026-01-05", title: "University offices re-open" },
    { id: 4, date: "2026-03-31", title: "Semester 1 census date" },
  ]);
  const months = groupUniversityCalendarEventsByMonth(events);

  assert.deepEqual(
    months.map(({ key, label }) => ({ key, label })),
    [
      { key: "2026-01", label: "January 2026" },
      { key: "2026-03", label: "March 2026" },
      { key: "2026-12", label: "December 2026" },
    ],
  );
  assert.deepEqual(
    months[0].events.map((event) => event.id),
    [2, 3],
  );
});

test("upcoming events include the boundary day and respect the limit", () => {
  const events = decorateUniversityCalendarEvents([
    { id: 1, date: "2026-02-20", title: "ANU Orientation Week" },
    { id: 2, date: "2026-02-23", title: "Semester 1 begins" },
    { id: 3, date: "2026-03-31", title: "Semester 1 census date" },
    { id: 4, date: "2026-06-04", title: "Examination period begins" },
    { id: 5, date: "2026-07-20", title: "Semester 2 begins" },
  ]);

  const upcoming = upcomingUniversityCalendarEvents(events, "2026-02-23", 3);
  assert.deepEqual(
    upcoming.map((event) => event.id),
    [2, 3, 4],
  );
  assert.deepEqual(
    upcomingUniversityCalendarEvents(events, "2026-08-01", 3),
    [],
  );
});

test("key dates around today keep the last one passed and skip holidays", () => {
  const events = decorateUniversityCalendarEvents([
    { id: 1, date: "2026-09-28", title: "Semester 2 teaching break ends" },
    { id: 2, date: "2026-10-05", title: "Labour Day public holiday" },
    { id: 3, date: "2026-10-09", title: "Last day to drop Semester 2 courses" },
    { id: 4, date: "2026-10-30", title: "Semester 2 ends" },
  ]);
  assert.deepEqual(
    keyDatesAround(events, "2026-10-06", 2).map((event) => event.id),
    [1, 3, 4],
  );
  assert.deepEqual(
    keyDatesAround(events, "2026-12-01").map((event) => event.id),
    [4],
  );
  assert.equal(daysBetween("2026-10-06", "2026-10-09"), 3);
});
