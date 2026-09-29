import assert from "node:assert/strict";

import { test } from "vitest";

const {
  academicSummary,
  academicTermPoints,
  gradeDistribution,
  tuitionEstimate,
} = await import("../lib/coursemap/academic-metrics.ts");

const terms = [
  {
    id: "2025-s1",
    year: 2025,
    name: "First Semester",
    shortName: "Semester 1",
    dates: "24 Feb to 30 May",
  },
  {
    id: "2025-s2",
    year: 2025,
    name: "Second Semester",
    shortName: "Semester 2",
    dates: "28 July to 31 Oct",
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
  { code: "COMP1100", year: 2025, units: 6, domesticFee: 1110 },
  { code: "MATH1005", year: 2025, units: 6, domesticFee: null },
  { code: "COMP2100", year: 2025, units: 12, domesticFee: 2400 },
];

const attempt = (overrides) => ({
  id: overrides.courseCode + overrides.termId,
  status: "completed",
  ...overrides,
});

test("weights each teaching period by units, not by course count", () => {
  const points = academicTermPoints({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", mark: 80 }),
      attempt({ courseCode: "COMP2100", termId: "2025-s1", mark: 50 }),
      attempt({ courseCode: "MATH1005", termId: "2025-s2", mark: 75 }),
    ],
  });
  assert.equal(points.length, 2);
  // 80 over 6 units and 50 over 12 units weights to 60, not the 65 flat mean.
  assert.equal(points[0].wam, 60);
  assert.equal(points[0].units, 18);
  assert.equal(points[1].wam, 75);
});

test("skips teaching periods with no marks rather than plotting a zero", () => {
  const points = academicTermPoints({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", mark: 70 }),
      attempt({ courseCode: "MATH1005", termId: "2025-s2", status: "planned" }),
    ],
  });
  assert.deepEqual(
    points.map((point) => point.id),
    ["2025-s1"],
  );
});

test("reports the movement against the previous graded semester", () => {
  const summary = academicSummary({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", mark: 70 }),
      attempt({ courseCode: "MATH1005", termId: "2025-s2", mark: 76 }),
    ],
  });
  assert.equal(summary.delta, 6);
  assert.equal(summary.wam, 73);
  assert.equal(summary.band, "Distinction");
  assert.equal(summary.markedCourses, 2);
  assert.equal(summary.markedUnits, 12);
});

test("leaves every headline figure null until a result is recorded", () => {
  const summary = academicSummary({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", status: "planned" }),
    ],
  });
  assert.equal(summary.wam, null);
  assert.equal(summary.gpa, null);
  assert.equal(summary.band, null);
  assert.equal(summary.delta, null);
});

test("returns every grade band so an empty band still holds its place", () => {
  const grades = gradeDistribution({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", mark: 85 }),
      attempt({ courseCode: "MATH1005", termId: "2025-s2", mark: 72 }),
    ],
  });
  assert.deepEqual(
    grades.map((grade) => [grade.code, grade.count]),
    [
      ["HD", 1],
      ["D", 1],
      ["CR", 0],
      ["P", 0],
      ["N", 0],
    ],
  );
});

test("lists each semester's marked courses and its grade point average", () => {
  const [point] = academicTermPoints({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "MATH1005", termId: "2025-s1", mark: 85 }),
      attempt({ courseCode: "COMP1100", termId: "2025-s1", mark: 65 }),
    ],
  });
  assert.deepEqual(point.marks, [
    { code: "COMP1100", mark: 65 },
    { code: "MATH1005", mark: 85 },
  ]);
  // A credit (5) and a high distinction (7) over equal units.
  assert.equal(point.gpa, 6);
});

test("reads grade points from a grade code when no mark is recorded", () => {
  const { gpa } = academicSummary({
    courses,
    terms,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1", resultCode: "HD" }),
      attempt({ courseCode: "MATH1005", termId: "2025-s1", resultCode: "CR" }),
    ],
  });
  assert.equal(gpa, 6);
});

test("a mark decides grade points even when a grade code is stored", () => {
  const { gpa } = academicSummary({
    courses,
    terms,
    attempts: [
      attempt({
        courseCode: "COMP1100",
        termId: "2025-s1",
        mark: 72,
        resultCode: "D",
      }),
    ],
  });
  assert.equal(gpa, 6);
});

test("averages retain a failed attempt when the same course is repeated or planned again", () => {
  const attempts = [
    attempt({
      id: "failed",
      courseCode: "COMP1100",
      termId: "2025-s1",
      status: "failed",
      mark: 30,
      resultCode: "N",
      unitsAttempted: 12,
      unitsEarned: 0,
    }),
    attempt({
      id: "passed",
      courseCode: "COMP1100",
      termId: "2025-s2",
      mark: 80,
      resultCode: "HD",
      unitsAttempted: 6,
      unitsEarned: 6,
    }),
    attempt({
      id: "future",
      courseCode: "COMP1100",
      termId: "unscheduled",
      status: "planned",
      mark: 100,
    }),
  ];
  const summary = academicSummary({ courses, terms, attempts });
  assert.equal(summary.wam, (30 * 12 + 80 * 6) / 18);
  assert.equal(summary.gpa, (7 * 6) / 18);
  assert.equal(summary.markedCourses, 2);
  assert.equal(summary.markedUnits, 18);
  const points = academicTermPoints({ courses, terms, attempts });
  assert.deepEqual(
    points.map(({ gpa, units }) => ({ gpa, units })),
    [
      { gpa: 0, units: 12 },
      { gpa: 7, units: 6 },
    ],
  );
  const grades = gradeDistribution({ courses, terms, attempts });
  assert.equal(grades.find(({ code }) => code === "N").count, 1);
  assert.equal(grades.find(({ code }) => code === "HD").count, 1);
});

test("zero-point fail grades count attempted load while non-failure withdrawals stay outside GPA", () => {
  const attempts = [
    attempt({
      courseCode: "COMP1100",
      termId: "2025-s1",
      resultCode: "HD",
      unitsAttempted: 6,
    }),
    ...["N", "NCN", "WN", "WD", "WL", "CRS", "RP"].map((resultCode) =>
      attempt({
        id: resultCode,
        courseCode: "MATH1005",
        termId: "2025-s1",
        status: ["WN", "WD", "WL"].includes(resultCode)
          ? "withdrawn"
          : "failed",
        resultCode,
        unitsAttempted: 6,
        unitsEarned: 0,
      }),
    ),
  ];
  assert.equal(academicSummary({ courses, terms, attempts }).gpa, 7 / 4);
});

test("academic weighting prefers attempted load over earned credit and later catalogue units", () => {
  const attempts = [
    attempt({
      courseCode: "COMP1100",
      termId: "2025-s1",
      mark: 80,
      unitsAttempted: 12,
      unitsEarned: 6,
    }),
    attempt({
      courseCode: "MATH1005",
      termId: "2025-s1",
      mark: 50,
      unitsAttempted: 6,
      unitsEarned: 6,
    }),
  ];
  const summary = academicSummary({ courses, terms, attempts });
  assert.equal(summary.wam, 70);
  assert.equal(summary.gpa, 6);
});

test("saved academic results remain counted when their catalogue course is unavailable", () => {
  const attempts = [
    attempt({
      courseCode: "COMP1100",
      termId: "2025-s1",
      mark: 80,
      unitsAttempted: 6,
      unitsEarned: 6,
    }),
    attempt({
      courseCode: "HIST1001",
      termId: "2025-s1",
      status: "failed",
      mark: 30,
      resultCode: "N",
      unitsAttempted: 12,
      unitsEarned: 0,
    }),
  ];
  const summary = academicSummary({ courses, terms, attempts });
  assert.equal(summary.gpa, 7 / 3);
  assert.equal(summary.wam, (80 * 6 + 30 * 12) / 18);
  assert.equal(summary.markedCourses, 2);
  assert.deepEqual(academicTermPoints({ courses, terms, attempts })[0].marks, [
    { code: "COMP1100", mark: 80 },
    { code: "HIST1001", mark: 30 },
  ]);
});

test("a graded result without an attempted load does not produce a misleading average", () => {
  const attempts = [
    attempt({
      courseCode: "COMP1100",
      termId: "2025-s1",
      mark: 80,
      unitsAttempted: 6,
    }),
    attempt({
      courseCode: "HIST1001",
      termId: "2025-s1",
      status: "failed",
      mark: 30,
      resultCode: "N",
      unitsEarned: 0,
    }),
  ];
  const summary = academicSummary({ courses, terms, attempts });
  assert.equal(summary.gpa, null);
  assert.equal(summary.wam, null);
  assert.deepEqual(academicTermPoints({ courses, terms, attempts }), []);
});

test("a grade-only fail gives the GPA chart a zero without inventing a WAM", () => {
  const attempts = [
    attempt({
      courseCode: "COMP1100",
      termId: "2025-s1",
      status: "failed",
      resultCode: "NCN",
      unitsAttempted: 12,
      unitsEarned: 0,
    }),
  ];
  const summary = academicSummary({ courses, terms, attempts });
  assert.equal(summary.gpa, 0);
  assert.equal(summary.wam, null);
  assert.deepEqual(
    academicTermPoints({ courses, terms, attempts }).map(
      ({ gpa, wam, units }) => ({ gpa, wam, units }),
    ),
    [{ gpa: 0, wam: null, units: 12 }],
  );
});

test("sums each course's raw domestic fee by study year", () => {
  const estimate = tuitionEstimate({
    courses,
    attempts: [
      attempt({ courseCode: "COMP1100", termId: "2025-s1" }),
      attempt({ courseCode: "COMP2100", termId: "2026-s1", status: "planned" }),
      attempt({ courseCode: "MATH1005", termId: "2026-s1", status: "planned" }),
    ],
  });
  assert.equal(estimate.total, 3510);
  assert.equal(estimate.pricedCourses, 2);
  assert.equal(estimate.plannedCourses, 3);
  assert.deepEqual(estimate.byYear, [
    { year: 2025, amount: 1110, courses: 1 },
    { year: 2026, amount: 2400, courses: 1 },
  ]);
});

test("returns null rather than a zero estimate when no fee is published", () => {
  const estimate = tuitionEstimate({
    courses,
    attempts: [attempt({ courseCode: "MATH1005", termId: "2025-s1" })],
  });
  assert.equal(estimate, null);
});
