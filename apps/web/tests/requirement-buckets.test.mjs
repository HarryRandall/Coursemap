import assert from "node:assert/strict";
import { test } from "vitest";

const { requirementBucketProgress, requirementBucketStatus } =
  await import("../lib/coursemap/requirement-progress.ts");

function course(code, level, units = 6) {
  return {
    code,
    name: code,
    year: 2026,
    units,
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
  };
}

const catalogue = {
  courses: [course("COMP1100", 1000), course("COMP1110", 1000)],
  terms: [{ id: "2026-s1", year: 2026, name: "Semester 1", shortName: "S1" }],
};

const attempt = (courseCode, status) => ({
  id: courseCode + status,
  courseCode,
  termId: "2026-s1",
  academicYear: 2026,
  status,
});

const option = (code) => ({
  code,
  kind: "course",
  position: 0,
  structureKind: null,
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

function buckets(node, attempts = []) {
  return requirementBucketProgress({
    requirements: [
      {
        structureKind: "programme",
        root: {
          type: "group",
          id: 1,
          operator: "all_of",
          children: [node],
          description: null,
          groupKey: "g1",
          maximumUnits: null,
          minimumCount: null,
          minimumUnits: null,
          position: 1,
          sourceLocator: "",
          sourceText: "",
          title: null,
        },
      },
    ],
    attempts,
    catalogue,
  });
}

const COMPULSORY =
  "30 units from the completion of the following compulsory courses";

test("drops the unit lead from the label so a narrow card shows the subject", () => {
  const [bucket] = buckets(
    condition(2, { sourceText: COMPULSORY, options: [option("COMP1100")] }),
  );
  assert.equal(bucket.title, "Compulsory courses");
  assert.equal(bucket.description, COMPULSORY);
});

test("recovers the unit target stated in the prose when no field carries it", () => {
  const [bucket] = buckets(
    condition(2, { sourceText: COMPULSORY, options: [option("COMP1100")] }),
  );
  assert.equal(bucket.targetUnits, 30);
});

test("prefers the published minimum over the figure in the prose", () => {
  const [bucket] = buckets(
    condition(2, {
      sourceText: COMPULSORY,
      minimumUnits: 24,
      options: [option("COMP1100")],
    }),
  );
  assert.equal(bucket.targetUnits, 24);
});

test("keeps prose that is not a unit lead intact", () => {
  const [bucket] = buckets(
    condition(2, {
      sourceText: "Complete a major in Computer Science",
      options: [option("COMP1100")],
    }),
  );
  assert.equal(bucket.title, "Complete a major in Computer Science");
  assert.equal(bucket.targetUnits, null);
});

test("separates completed units from scheduled ones", () => {
  const [bucket] = buckets(
    condition(2, {
      sourceText: COMPULSORY,
      options: [option("COMP1100"), option("COMP1110")],
    }),
    [attempt("COMP1100", "completed"), attempt("COMP1110", "planned")],
  );
  assert.equal(bucket.completedUnits, 6);
  assert.equal(bucket.plannedUnits, 6);
  assert.deepEqual(requirementBucketStatus(bucket), {
    status: "short",
    label: "18u short",
  });
});

test("a group met only by planned work reads as scheduled, not complete", () => {
  assert.deepEqual(
    requirementBucketStatus({
      key: "k",
      title: "t",
      description: "t",
      targetUnits: 12,
      completedUnits: 6,
      plannedUnits: 6,
    }),
    { status: "scheduled", label: "Scheduled" },
  );
});

test("a group with no published target is never reported complete", () => {
  assert.deepEqual(
    requirementBucketStatus({
      key: "k",
      title: "t",
      description: "t",
      targetUnits: null,
      completedUnits: 18,
      plannedUnits: 0,
    }),
    { status: "untargeted", label: "18 units mapped" },
  );
});
