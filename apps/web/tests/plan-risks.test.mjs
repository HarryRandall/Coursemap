import assert from "node:assert/strict";
import { test } from "vitest";

const { planRisks } = await import("../lib/coursemap/plan-risks.ts");

function course(code, level, overrides = {}) {
  return {
    code,
    name: code,
    year: 2026,
    units: 6,
    level,
    subject: code.slice(0, 4),
    school: "",
    convener: "",
    sessions: [],
    delivery: "",
    description: "",
    prerequisiteText: "",
    prerequisiteCodes: [],
    incompatibilities: [],
    countsTowards: [],
    sourceUrl: "",
    lastChanged: "",
    parseState: "Verified",
    accent: "violet",
    ...overrides,
  };
}

const catalogue = {
  courses: [
    course("COMP1100", 1000),
    course("COMP2100", 2000, { prerequisiteCodes: ["COMP1100"] }),
  ],
  terms: [
    { id: "2026-s1", year: 2026, name: "Semester 1", shortName: "S1" },
    { id: "2026-s2", year: 2026, name: "Semester 2", shortName: "S2" },
  ],
};

const attempt = (courseCode, status, termId = "2026-s1") => ({
  id: courseCode + termId,
  courseCode,
  termId,
  academicYear: 2026,
  status,
});

const progress = {
  completed: 0,
  planned: 0,
  remaining: 0,
  mapped: 0,
  total: 144,
  percent: 0,
};

const bucket = (overrides) => ({
  key: "b1",
  title: "Compulsory courses",
  description:
    "30 units from the completion of the following compulsory courses",
  kind: "Requirement",
  targetUnits: 30,
  completedUnits: 0,
  plannedUnits: 0,
  ...overrides,
});

test("raises a shortfall for a requirement that cannot be met by the plan", () => {
  const risks = planRisks({
    buckets: [bucket({ completedUnits: 6, plannedUnits: 6 })],
    attempts: [],
    catalogue,
    progress,
  });
  assert.equal(risks.length, 1);
  assert.equal(risks[0].severity, "warning");
  assert.match(risks[0].detail, /18 units still to place/);
});

test("stays quiet when the requirement is already covered", () => {
  const risks = planRisks({
    buckets: [bucket({ completedUnits: 30 })],
    attempts: [],
    catalogue,
    progress,
  });
  assert.deepEqual(risks, []);
});

test("flags a course whose prerequisites the plan does not satisfy", () => {
  const risks = planRisks({
    buckets: [],
    attempts: [attempt("COMP2100", "planned")],
    catalogue,
    progress,
  });
  assert.equal(risks.length, 1);
  assert.equal(risks[0].severity, "warning");
  assert.match(risks[0].detail, /COMP1100/);
});

test("clears the prerequisite flag once the dependency sits in an earlier term", () => {
  const risks = planRisks({
    buckets: [],
    attempts: [
      attempt("COMP1100", "completed", "2026-s1"),
      attempt("COMP2100", "planned", "2026-s2"),
    ],
    catalogue,
    progress,
  });
  assert.deepEqual(risks, []);
});

test("reports unplaced units and sorts warnings above information", () => {
  const risks = planRisks({
    buckets: [bucket({ completedUnits: 0, plannedUnits: 0 })],
    attempts: [],
    catalogue,
    progress: { ...progress, remaining: 132 },
  });
  assert.deepEqual(
    risks.map((risk) => risk.severity),
    ["warning", "info"],
  );
  assert.match(risks[1].detail, /132 of 144 units/);
});
