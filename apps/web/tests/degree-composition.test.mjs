import assert from "node:assert/strict";
import { test } from "vitest";

const { degreeComposition } =
  await import("../lib/coursemap/degree-composition.ts");

function course(code, level) {
  return {
    code,
    name: `${code} name`,
    year: 2026,
    units: 6,
    level,
    subject: code.slice(0, 4),
  };
}

const catalogue = {
  courses: [
    course("COMP1100", 1000),
    course("COMP1110", 1000),
    course("COMP2100", 2000),
    course("MATH1005", 1000),
    course("ARTH1006", 1000),
  ],
  terms: [{ id: "2026-s1", year: 2026, name: "Semester 1", shortName: "S1" }],
};

const attempt = (courseCode, status) => ({
  id: courseCode,
  courseCode,
  termId: "2026-s1",
  academicYear: 2026,
  status,
});

function condition(id, overrides) {
  return {
    type: "condition",
    id,
    conditionKind: "course_set_units",
    freeText: null,
    maximumLevel: null,
    maximumUnits: null,
    minimumCourses: null,
    minimumLevel: null,
    minimumUnits: null,
    options: [],
    position: id,
    projectionKey: `c${id}`,
    sourceLocator: "",
    sourceText: "",
    structureKind: null,
    subjectCode: null,
    tag: null,
    ...overrides,
  };
}

const root = (children) => ({
  type: "group",
  id: 100,
  operator: "all_of",
  children,
  description: null,
  groupKey: "root",
  maximumUnits: null,
  minimumCount: null,
  minimumUnits: null,
  position: 0,
  sourceLocator: "",
  sourceText: "",
  title: null,
});

const option = (code) => ({
  code,
  kind: "course",
  position: 0,
  structureKind: null,
});

const programme = {
  structureCode: "BCOMP",
  structureKind: "programme",
  structureName: "Bachelor of Computing",
  snapshotId: 1,
  unmodelled: [],
  root: root([
    condition(1, {
      minimumUnits: 12,
      options: [option("MATH1005"), option("COMP1100")],
    }),
    condition(2, {
      conditionKind: "other",
      structureKind: "major",
      minimumUnits: 48,
    }),
  ]),
};

const major = {
  structureCode: "COMP-MAJ",
  structureKind: "major",
  structureName: "Computer Science",
  snapshotId: 2,
  unmodelled: [],
  root: root([
    condition(3, {
      conditionKind: "subject_units",
      subjectCode: "COMP",
      minimumUnits: 48,
    }),
  ]),
};

function compose(
  profile,
  attempts,
  offered = { majorCodes: [], minorCodes: [] },
) {
  return degreeComposition({
    degreeUnits: 144,
    profile: { degreeCode: "BCOMP", majorCode: "", minorCodes: [], ...profile },
    programme: offered,
    structureOptions: [
      { code: "COMP-MAJ", name: "Computer Science", units: 48 },
    ],
    requirements: [programme, major],
    attempts,
    catalogue,
  });
}

test("orders programme core, major and electives and sizes electives from the rest", () => {
  const sections = compose({ majorCode: "COMP-MAJ" }, []);
  assert.deepEqual(
    sections.map((section) => [section.kind, section.targetUnits]),
    [
      ["core", 12],
      ["major", 48],
      ["electives", 84],
    ],
  );
  assert.equal(sections[1].structureName, "Computer Science");
});

test("places each course in the first section with room and overflows to electives", () => {
  const sections = compose({ majorCode: "COMP-MAJ" }, [
    attempt("MATH1005", "completed"),
    attempt("COMP1100", "completed"),
    attempt("COMP1110", "planned"),
    attempt("ARTH1006", "planned"),
  ]);
  const codes = Object.fromEntries(
    sections.map((section) => [
      section.kind,
      section.courses.map((item) => item.code),
    ]),
  );
  assert.deepEqual(codes.core, ["COMP1100", "MATH1005"]);
  assert.deepEqual(codes.major, ["COMP1110"]);
  assert.deepEqual(codes.electives, ["ARTH1006"]);
  assert.equal(sections[0].courses[0].status, "completed");
});

test("a required major is reserved and offered before it is chosen", () => {
  const major = compose({}, []).find((section) => section.kind === "major");
  assert.equal(major.unchosen, true);
  assert.equal(major.targetUnits, 48);
});

test("an optional minor is offered without taking units from electives", () => {
  const sections = compose({ majorCode: "COMP-MAJ" }, [], {
    majorCodes: ["COMP-MAJ"],
    minorCodes: ["ARTH-MIN"],
  });
  const minor = sections.find((section) => section.kind === "minor");
  assert.equal(minor.unchosen, true);
  assert.equal(minor.targetUnits, null);
  assert.equal(sections.at(-1).targetUnits, 84);
});
