import assert from "node:assert/strict";

import { test } from "vitest";

const {
  cumulativeDashboardUnits,
  currentDashboardTermId,
  dashboardCalendarEvents,
  dashboardTermLoads,
} = await import("../lib/coursemap/dashboard-series.ts");

const terms = [
  {
    id: "2026-s1",
    year: 2026,
    name: "First Semester",
    shortName: "Semester 1",
    dates: "23 Feb to 29 May",
    startsOn: "2026-02-23",
    endsOn: "2026-05-29",
  },
  {
    id: "2026-s2",
    year: 2026,
    name: "Second Semester",
    shortName: "Semester 2",
    dates: "27 July to 30 Oct",
    startsOn: "2026-07-27",
    endsOn: "2026-10-30",
  },
  {
    id: "unscheduled",
    year: 9999,
    name: "Later",
    shortName: "Later",
    dates: "Choose when ready",
  },
];

const courses = [
  { code: "COMP1100", year: 2026, units: 6, accent: "violet" },
  { code: "MATH1005", year: 2026, units: 6, accent: "blue" },
];

test("dashboard charts use the saved active plan, not duplicate planned records", () => {
  const attempts = [
    {
      id: "planned-comp",
      courseCode: "COMP1100",
      termId: "2026-s1",
      status: "planned",
    },
    {
      id: "planned-math",
      courseCode: "MATH1005",
      termId: "2026-s2",
      status: "planned",
    },
    {
      id: "completed-comp",
      courseCode: "COMP1100",
      termId: "2026-s2",
      status: "completed",
    },
    {
      id: "failed-course",
      courseCode: "MATH1005",
      termId: "2026-s1",
      status: "failed",
    },
  ];
  const loads = dashboardTermLoads({ attempts, courses, terms });

  assert.deepEqual(
    loads.map(({ id, completed, planned, units }) => ({
      id,
      completed,
      planned,
      units,
    })),
    [
      { id: "2026-s1", completed: 0, planned: 0, units: 0 },
      { id: "2026-s2", completed: 6, planned: 6, units: 12 },
    ],
  );
  assert.equal(cumulativeDashboardUnits(loads)[1].units, 12);
});

test("dashboard calendar events retain imported study-period dates", () => {
  const attempts = [
    {
      id: "math",
      courseCode: "MATH1005",
      termId: "2026-s2",
      status: "planned",
    },
  ];
  const events = dashboardCalendarEvents({ attempts, courses, terms });

  assert.deepEqual(events, [
    {
      courseCode: "MATH1005",
      accent: "blue",
      termId: "2026-s2",
      termName: "Second Semester 2026",
      startsOn: "2026-07-27",
      endsOn: "2026-10-30",
    },
  ]);
  assert.equal(currentDashboardTermId(terms, "2026-08-17"), "2026-s2");
});

test("dashboard summaries use the attempt snapshot and its recorded units", () => {
  const published = {
    code: "COMP1100",
    year: 2026,
    snapshotId: 303,
    units: 12,
    accent: "violet",
  };
  const historical = {
    ...published,
    snapshotId: 101,
    units: 6,
    accent: "rose",
  };
  const attempts = [
    {
      id: "historical-comp",
      academicYear: 2026,
      courseCode: "COMP1100",
      snapshotId: 101,
      termId: "2026-s1",
      status: "completed",
      unitsAttempted: 3,
      unitsEarned: 3,
    },
  ];
  const catalogue = {
    attempts,
    courses: [published],
    snapshotCourses: [historical],
    terms,
  };

  assert.equal(dashboardTermLoads(catalogue)[0].completed, 3);
  assert.equal(dashboardCalendarEvents(catalogue)[0].accent, "rose");
});
