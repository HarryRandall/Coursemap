import assert from "node:assert/strict";

import { test } from "vitest";

const { adminUserStudyProgress, adminUserTermLoads, uniqueTrackedCourseCount } =
  await import("../lib/admin/user-study.ts");

function course(overrides) {
  return {
    id: crypto.randomUUID(),
    code: "COMP1100",
    title: "Programming as Problem Solving",
    units: 6,
    unitsEarned: 0,
    calendarYear: 2026,
    periodCode: "S1",
    periodName: "First Semester",
    periodShortName: "S1",
    status: "planned",
    mark: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("admin study progress uses the latest record for each course", () => {
  const study = {
    plan: null,
    structures: [
      { role: "programme", code: "BCOMP", name: "Computing", units: 144 },
    ],
    courses: [
      course({ id: "planned", status: "planned" }),
      course({
        id: "completed",
        status: "completed",
        unitsEarned: 6,
        calendarYear: 2026,
        periodCode: "S2",
      }),
      course({ id: "math", code: "MATH1005", status: "enrolled" }),
      course({ id: "failed", code: "COMP1600", status: "failed" }),
    ],
  };

  assert.deepEqual(adminUserStudyProgress(study), {
    completed: 6,
    planned: 6,
    mapped: 12,
    remaining: 132,
    total: 144,
    percent: 4,
  });
  assert.equal(uniqueTrackedCourseCount(study.courses), 3);
});

test("admin term loads exclude failed and unscheduled records", () => {
  const loads = adminUserTermLoads([
    course({ id: "complete", status: "completed", unitsEarned: 6 }),
    course({ id: "planned", code: "MATH1005", periodCode: "S2" }),
    course({ id: "failed", code: "COMP1600", status: "failed" }),
    course({
      id: "later",
      code: "COMP2100",
      calendarYear: null,
      periodCode: null,
    }),
  ]);

  assert.deepEqual(
    loads.map(({ id, completed, planned, units }) => ({
      id,
      completed,
      planned,
      units,
    })),
    [
      { id: "2026-s1", completed: 6, planned: 0, units: 6 },
      { id: "2026-s2", completed: 0, planned: 6, units: 6 },
    ],
  );
});

test("admin study progress counts units exactly as the student's plan does", async () => {
  const { degreeUnitProgress } = await import("../lib/planner.ts");
  const catalogue = {
    courses: [
      { code: "COMP1100", year: 2026, units: 6 },
      { code: "COMP1110", year: 2026, units: 6 },
      { code: "MATH1005", year: 2026, units: 6 },
      { code: "COMP2100", year: 2026, units: 6 },
      { code: "COMP2120", year: 2026, units: 12 },
    ],
    terms: [],
  };
  const rows = [
    course({ id: "plan", code: "COMP2120", units: 12, periodCode: "S2" }),
    course({
      id: "fail",
      code: "COMP1100",
      status: "failed",
      units: 6,
      unitsEarned: 0,
      calendarYear: 2025,
    }),
    course({
      id: "pass",
      code: "COMP1100",
      status: "completed",
      units: 6,
      unitsEarned: 6,
    }),
    course({
      id: "credit",
      code: "MATH1005",
      status: "credited",
      units: 6,
      unitsEarned: 6,
    }),
    // A recorded completion that earned no credit adds no units.
    course({
      id: "no-credit",
      code: "COMP1110",
      status: "completed",
      units: 6,
      unitsEarned: 0,
    }),
    course({
      id: "enrolled",
      code: "COMP2100",
      status: "enrolled",
      units: 6,
      periodCode: "S2",
    }),
  ];
  const studentAttempts = [
    {
      id: "plan",
      academicYear: 2026,
      courseCode: "COMP2120",
      termId: "2026-s2",
      status: "planned",
    },
    ...rows
      .filter((row) => row.status !== "planned")
      .map((row) => ({
        id: row.id,
        courseCode: row.code,
        termId: `${row.calendarYear}-${row.periodCode.toLowerCase()}`,
        status: row.status === "credited" ? "completed" : row.status,
        unitsAttempted: row.units,
        unitsEarned: row.unitsEarned,
      })),
  ];
  const study = {
    plan: null,
    structures: [
      { role: "programme", code: "BCOMP", name: "Computing", units: 144 },
    ],
    courses: rows,
  };

  const student = degreeUnitProgress(studentAttempts, 144, catalogue);
  assert.deepEqual(adminUserStudyProgress(study), student);
  assert.equal(student.completed, 12);
  assert.equal(student.mapped, 30);
});
