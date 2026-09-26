import assert from "node:assert/strict";
import { test } from "vitest";

const { "requirement-progress": progressModule } = {
  "requirement-progress":
    await import("../lib/coursemap/requirement-progress.ts"),
};
const { allocateRequirements, requirementTreeProgress, requirementNodeKey } =
  progressModule;

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
    conditionKind: "other",
    freeText: "Approval of the program convener",
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

test("a part never takes more than its maximum; the extra course counts nowhere", () => {
  const rule = condition(1, {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumUnits: 6,
    maximumUnits: 6,
  });
  const root = group(10, "all_of", [rule]);
  const attempts = [
    attempt("a", "COMP1100", "completed"),
    attempt("b", "COMP1110", "planned"),
  ];
  const result = requirementTreeProgress({ root, attempts, catalogue });
  assert.equal(result.get(requirementNodeKey(rule)).state, "satisfied");
  assert.deepEqual(result.get(requirementNodeKey(rule)).matchedCourseCodes, [
    "COMP1100",
  ]);
  assert.equal(
    allocateRequirements({ root, attempts, catalogue }).get("COMP1110").nodeKey,
    null,
  );
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
        conditionKind: "other",
        freeText: "Approval of the program convener",
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

const allocationCatalogue = {
  courses: [
    course("COMP1100", 1000),
    course("COMP1110", 1000),
    course("MATH1013", 1000),
    course("COMP2100", 2000),
    course("COMP3600", 3000),
    course("COMP3620", 3000),
    course("COMP4450", 4000),
    course("ARTH2181", 2000),
    { ...course("PHYS2101", 2000), tags: ["Science"] },
  ],
  terms,
};

/** Shaped like AACOM: caps and minimums "of which", parts it "must include". */
function degree() {
  const cap = condition(1, {
    conditionKind: "level_units",
    maximumLevel: 1000,
    maximumUnits: 12,
    scope: "degree",
  });
  const research = condition(2, {
    conditionKind: "level_units",
    subjectCode: "COMP",
    minimumLevel: 4000,
    minimumUnits: 6,
    scope: "degree",
  });
  const compulsory = condition(3, {
    minimumUnits: 12,
    options: [option("COMP2100"), option("COMP3600")],
  });
  const advanced = condition(4, {
    conditionKind: "subject_units",
    subjectCode: "COMP",
    minimumLevel: 3000,
    minimumUnits: 12,
  });
  const ict = condition(5, {
    minimumUnits: 6,
    options: [option("ARTH2181")],
    includesAnyCourse: true,
  });
  const electives = condition(6, {
    conditionKind: "elective_units",
    minimumUnits: 12,
  });
  const root = group(10, "all_of", [
    cap,
    research,
    compulsory,
    advanced,
    ict,
    electives,
  ]);
  return { root, cap, research, compulsory, advanced, ict, electives };
}

const allocationAttempts = [
  attempt("a", "COMP1100", "completed"),
  attempt("b", "COMP1110", "completed"),
  attempt("c", "MATH1013", "planned"),
  attempt("d", "COMP2100", "completed"),
  attempt("e", "COMP3600", "completed"),
  attempt("f", "COMP3620", "planned"),
  attempt("g", "COMP4450", "planned"),
  attempt("h", "PHYS2101", "planned"),
];

test("each course counts towards one part, most specific first", () => {
  const { root, compulsory, advanced, ict, electives } = degree();
  const placed = allocateRequirements({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
  });
  const nodeOf = (code) => placed.get(code).nodeKey;
  // COMP3600 is a 3000-level COMP course too, but the named list wins.
  assert.equal(nodeOf("COMP3600"), requirementNodeKey(compulsory));
  assert.equal(nodeOf("COMP2100"), requirementNodeKey(compulsory));
  assert.equal(nodeOf("COMP3620"), requirementNodeKey(advanced));
  assert.equal(nodeOf("COMP4450"), requirementNodeKey(advanced));
  // An open list takes any course once its own list has nothing left.
  assert.equal(nodeOf("COMP1100"), requirementNodeKey(ict));
  assert.equal(nodeOf("COMP1110"), requirementNodeKey(electives));
  assert.equal(nodeOf("PHYS2101"), requirementNodeKey(electives));
});

test("a course beyond a degree-wide cap counts towards nothing", () => {
  const { root, cap } = degree();
  const placed = allocateRequirements({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
  });
  // Two completed 1000-level courses fill the 12-unit cap; the planned third
  // is the one left out, whatever order the plan lists them in.
  assert.deepEqual(placed.get("MATH1013"), {
    nodeKey: null,
    pinned: false,
    overCapKey: requirementNodeKey(cap),
  });
  const progress = requirementTreeProgress({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
    allocation: placed,
  });
  assert.equal(progress.get(requirementNodeKey(cap)).state, "over_limit");
});

test("a degree-wide minimum reads courses without using them up", () => {
  const { root, research, advanced } = degree();
  const progress = requirementTreeProgress({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
  });
  assert.deepEqual(
    progress.get(requirementNodeKey(research)).matchedCourseCodes,
    ["COMP4450"],
  );
  assert.ok(
    progress
      .get(requirementNodeKey(advanced))
      .matchedCourseCodes.includes("COMP4450"),
  );
});

test("electives are measured, and a student's choice moves a course", () => {
  const { root, ict, electives } = degree();
  const pins = new Map([["COMP1100", requirementNodeKey(electives)]]);
  const placed = allocateRequirements({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
    pins,
  });
  assert.deepEqual(placed.get("COMP1100"), {
    nodeKey: requirementNodeKey(electives),
    pinned: true,
    overCapKey: null,
  });
  // The open list then takes the next course that fits it.
  assert.equal(placed.get("COMP1110").nodeKey, requirementNodeKey(ict));
  const progress = requirementTreeProgress({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
    allocation: placed,
  });
  assert.notEqual(
    progress.get(requirementNodeKey(electives)).state,
    "unmeasured",
  );

  // A choice the course cannot satisfy is ignored.
  const wrong = allocateRequirements({
    root,
    attempts: allocationAttempts,
    catalogue: allocationCatalogue,
    pins: new Map([["COMP1100", requirementNodeKey(degree().compulsory)]]),
  });
  assert.equal(wrong.get("COMP1100").pinned, false);
});
