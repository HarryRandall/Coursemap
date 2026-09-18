import assert from "node:assert/strict";
import { test } from "vitest";

const { "requirement-progress": progressModule } = {
  "requirement-progress":
    await import("../lib/coursemap/requirement-progress.ts"),
};
const { requirementTreeProgress, requirementNodeKey } = progressModule;

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

const terms = [
  { id: "2026-s1", year: 2026, name: "Semester 1", shortName: "S1" },
];

const catalogue = {
  courses: [
    course("COMP1100", 1000),
    course("COMP1110", 1000),
    course("COMP2100", 2000),
    course("COMP3600", 3000),
    course("MATH1013", 1000),
  ],
  terms,
};

function attempt(id, courseCode, status) {
  return { id, courseCode, termId: "2026-s1", academicYear: 2026, status };
}

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

function group(id, operator, children, overrides = {}) {
  return {
    type: "group",
    id,
    operator,
    children,
    description: null,
    groupKey: `g${id}`,
    maximumUnits: null,
    minimumCount: null,
    minimumUnits: null,
    position: id,
    sourceLocator: "",
    sourceText: "",
    title: null,
    ...overrides,
  };
}

const option = (code) => ({
  code,
  kind: "course",
  position: 0,
  structureKind: null,
});

test("withdrawn courses do not contribute requirement units or hide a planned repeat", () => {
  const rule = condition(1, {
    minimumUnits: 6,
    options: [option("COMP1100")],
  });
  const root = group(10, "all_of", [rule]);
  const withdrawn = attempt("withdrawn", "COMP1100", "withdrawn");
  const progress = (attempts) =>
    requirementTreeProgress({ root, attempts, catalogue }).get(
      requirementNodeKey(rule),
    );
  assert.equal(progress([withdrawn]).state, "not_started");
  assert.equal(progress([withdrawn]).plannedUnits, 0);
  assert.deepEqual(progress([withdrawn]).matchedCourseCodes, []);
  assert.equal(
    progress([attempt("repeat", "COMP1100", "planned"), withdrawn])
      .plannedUnits,
    6,
  );
});

test("a listed-course rule is satisfied once its minimum units are completed", () => {
  const rule = condition(1, {
    minimumUnits: 12,
    options: [option("COMP1100"), option("COMP1110")],
  });
  const root = group(10, "all_of", [rule]);
  const progress = requirementTreeProgress({
    root,
    attempts: [
      attempt("a", "COMP1100", "completed"),
      attempt("b", "COMP1110", "completed"),
    ],
    catalogue,
  });
  const result = progress.get(requirementNodeKey(rule));
  assert.equal(result.state, "satisfied");
  assert.equal(result.completedUnits, 12);
  assert.equal(result.plannedUnits, 0);
  assert.deepEqual(result.matchedCourseCodes, ["COMP1100", "COMP1110"]);
  assert.equal(progress.get(requirementNodeKey(root)).state, "satisfied");
});

test("planned courses count as in progress and not as satisfied", () => {
  const rule = condition(1, {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumLevel: 3000,
    minimumUnits: 24,
  });
  const progress = requirementTreeProgress({
    root: group(10, "all_of", [rule]),
    attempts: [attempt("a", "COMP3600", "planned")],
    catalogue,
  });
  const result = progress.get(requirementNodeKey(rule));
  assert.equal(result.state, "in_progress");
  assert.equal(result.completedUnits, 0);
  assert.equal(result.plannedUnits, 6);
});

test("a maximum-only rule reports over_limit once the plan exceeds it", () => {
  const rule = condition(1, {
    conditionKind: "level_units",
    maximumLevel: 1000,
    maximumUnits: 12,
  });
  const within = requirementTreeProgress({
    root: group(10, "all_of", [rule]),
    attempts: [attempt("a", "COMP1100", "completed")],
    catalogue,
  });
  assert.equal(within.get(requirementNodeKey(rule)).state, "satisfied");

  const over = requirementTreeProgress({
    root: group(10, "all_of", [rule]),
    attempts: [
      attempt("a", "COMP1100", "completed"),
      attempt("b", "COMP1110", "planned"),
      attempt("c", "MATH1013", "planned"),
    ],
    catalogue,
  });
  assert.equal(over.get(requirementNodeKey(rule)).state, "over_limit");
});

test("unmeasured mandatory rules prevent certifying their group", () => {
  const tagRule = condition(1, {
    conditionKind: "tagged_units",
    tag: "Transdisciplinary Problem-Solving",
    minimumUnits: 12,
  });
  const listRule = condition(2, {
    minimumUnits: 6,
    options: [option("COMP2100")],
  });
  const root = group(10, "all_of", [tagRule, listRule]);
  const progress = requirementTreeProgress({
    root,
    attempts: [attempt("a", "COMP2100", "completed")],
    catalogue,
  });
  assert.equal(progress.get(requirementNodeKey(tagRule)).state, "unmeasured");
  assert.equal(progress.get(requirementNodeKey(root)).state, "unmeasured");
  assert.equal(progress.get(requirementNodeKey(listRule)).state, "satisfied");
});

test("any_of groups are satisfied by one alternative and count shared courses once", () => {
  const first = condition(1, {
    minimumUnits: 6,
    options: [option("COMP1100")],
  });
  const second = condition(2, {
    minimumUnits: 6,
    options: [option("COMP1100"), option("COMP1110")],
  });
  const root = group(10, "any_of", [first, second]);
  const progress = requirementTreeProgress({
    root,
    attempts: [attempt("a", "COMP1100", "completed")],
    catalogue,
  });
  const rootProgress = progress.get(requirementNodeKey(root));
  assert.equal(rootProgress.state, "satisfied");
  assert.equal(rootProgress.completedUnits, 6);
  assert.deepEqual(rootProgress.matchedCourseCodes, ["COMP1100"]);
});

test("a group with its own unit total needs both the children and the total", () => {
  const rule = condition(1, {
    minimumUnits: 6,
    options: [option("COMP1100"), option("COMP1110")],
  });
  const root = group(10, "all_of", [rule], { minimumUnits: 12 });
  const progress = requirementTreeProgress({
    root,
    attempts: [attempt("a", "COMP1100", "completed")],
    catalogue,
  });
  assert.equal(progress.get(requirementNodeKey(rule)).state, "satisfied");
  assert.equal(progress.get(requirementNodeKey(root)).state, "in_progress");
});

test("an empty tree yields no progress", () => {
  const progress = requirementTreeProgress({
    root: null,
    attempts: [],
    catalogue,
  });
  assert.equal(progress.size, 0);
});

test("a bounded unit rule still enforces its maximum after meeting the minimum", () => {
  const rule = condition(1, {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumUnits: 6,
    maximumUnits: 6,
  });
  const result = requirementTreeProgress({
    root: group(10, "all_of", [rule]),
    attempts: [
      attempt("a", "COMP1100", "completed"),
      attempt("b", "COMP1110", "planned"),
    ],
    catalogue,
  });
  assert.equal(result.get(requirementNodeKey(rule)).state, "over_limit");
});

test("completed credit survives a later planned duplicate", () => {
  const rule = condition(1, { minimumUnits: 6, options: [option("COMP1100")] });
  for (const attempts of [
    [
      attempt("a", "COMP1100", "completed"),
      attempt("b", "COMP1100", "planned"),
    ],
    [
      attempt("b", "COMP1100", "planned"),
      attempt("a", "COMP1100", "completed"),
    ],
  ]) {
    const result = requirementTreeProgress({
      root: group(10, "all_of", [rule]),
      attempts,
      catalogue,
    }).get(requirementNodeKey(rule));
    assert.equal(result.state, "satisfied");
    assert.equal(result.completedUnits, 6);
    assert.equal(result.plannedUnits, 0);
  }
});

test("an exceeded alternative does not invalidate a satisfied any_of branch", () => {
  const root = group(10, "any_of", [
    condition(1, {
      conditionKind: "subject_units",
      subjectCode: "COMP",
      maximumUnits: 0,
    }),
    condition(2, { minimumUnits: 6, options: [option("COMP1100")] }),
  ]);
  const result = requirementTreeProgress({
    root,
    attempts: [attempt("a", "COMP1100", "completed")],
    catalogue,
  });
  assert.equal(result.get(requirementNodeKey(root)).state, "satisfied");
});

test("minimum_count requires enough measured alternatives", () => {
  const root = group(
    10,
    "at_least",
    [
      condition(1, { minimumUnits: 6, options: [option("COMP1100")] }),
      condition(2, {
        conditionKind: "tagged_units",
        tag: "Unknown",
        minimumUnits: 6,
      }),
    ],
    { minimumCount: 2 },
  );
  const result = requirementTreeProgress({
    root,
    attempts: [attempt("a", "COMP1100", "completed")],
    catalogue,
  });
  assert.equal(result.get(requirementNodeKey(root)).state, "unmeasured");
});
