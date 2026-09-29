import assert from "node:assert/strict";

import { test } from "vitest";

const planner = await import("../lib/planner.ts");
const catalogue = await import("./fixtures/catalogue.ts");
const {
  courseIsAvailable,
  degreeUnitProgress,
  effectiveStatus,
  evaluateCoursePrerequisites,
  missingPrereqs,
  planningCourseByCode,
  planningCourseForAttempt,
  proposePrerequisiteFix,
  recommendedCoursesForTerm,
  termHasCapacity,
  unitsByCalendarYear,
} = planner;
const { courses, terms } = catalogue;
const planningYears = [
  ...new Set(
    terms.filter((term) => term.id !== "unscheduled").map((term) => term.year),
  ),
];
const demoCatalogue = {
  courses: courses.flatMap((course) =>
    planningYears.map((year) => ({ ...course, year })),
  ),
  terms,
};
const s1 = terms.find((term) => term.id === "2026-s1");
const s2 = terms.find((term) => term.id === "2026-s2");
const major = [
  "COMP1100",
  "COMP1110",
  "COMP2100",
  "COMP2120",
  "COMP3703",
  "COMP3900",
];

test("requires an explicit year when a course has multiple editions", () => {
  assert.equal(planningCourseByCode("COMP1100", demoCatalogue), undefined);
  assert.equal(
    planningCourseByCode("COMP1100", demoCatalogue, 2027)?.year,
    2027,
  );
  assert.equal(
    planningCourseForAttempt(
      {
        id: "selected-year",
        academicYear: 2028,
        courseCode: "COMP1100",
        termId: "unscheduled",
        status: "planned",
      },
      demoCatalogue,
    )?.year,
    2028,
  );
});

test("resolves recorded history by exact snapshot within the same course year", () => {
  const published = {
    ...planningCourseByCode("COMP1100", demoCatalogue, 2026),
    name: "Published COMP1100",
    prerequisiteCodes: ["COMP1110"],
    prerequisiteRule: {
      confidence: 0.41,
      expression: null,
      hardness: "hard",
      relationalExpression: null,
      reviewState: "review",
      sourceText: "Current published prerequisite",
    },
    prerequisiteText: "Current published prerequisite",
    snapshotId: 303,
    units: 12,
  };
  const historicalSixUnitSnapshot = {
    ...published,
    name: "Historical six-unit COMP1100",
    prerequisiteCodes: ["COMP1130"],
    prerequisiteRule: {
      confidence: 0.91,
      expression: null,
      hardness: "hard",
      relationalExpression: null,
      reviewState: "verified",
      sourceText: "Historical prerequisite",
    },
    prerequisiteText: "Historical prerequisite",
    snapshotId: 101,
    units: 6,
  };
  const historicalTwelveUnitSnapshot = {
    ...published,
    name: "Historical twelve-unit COMP1100",
    snapshotId: 202,
  };
  const snapshotCatalogue = {
    ...demoCatalogue,
    courses: demoCatalogue.courses.map((course) =>
      course.code === "COMP1100" && course.year === 2026 ? published : course,
    ),
    snapshotCourses: [historicalSixUnitSnapshot, historicalTwelveUnitSnapshot],
  };

  const sixUnitAttempt = {
    id: "historical-six",
    academicYear: 2026,
    courseCode: "COMP1100",
    snapshotId: 101,
    termId: "2026-s1",
    status: "completed",
  };
  const twelveUnitAttempt = {
    ...sixUnitAttempt,
    id: "historical-twelve",
    snapshotId: 202,
  };

  assert.equal(
    planningCourseForAttempt(sixUnitAttempt, snapshotCatalogue)?.name,
    "Historical six-unit COMP1100",
  );
  assert.equal(
    planningCourseForAttempt(sixUnitAttempt, snapshotCatalogue)
      ?.prerequisiteText,
    "Historical prerequisite",
  );
  assert.deepEqual(
    planningCourseForAttempt(sixUnitAttempt, snapshotCatalogue)
      ?.prerequisiteCodes,
    ["COMP1130"],
  );
  assert.equal(
    planningCourseForAttempt(sixUnitAttempt, snapshotCatalogue)
      ?.prerequisiteRule?.reviewState,
    "verified",
  );
  assert.equal(
    planningCourseForAttempt(sixUnitAttempt, snapshotCatalogue)
      ?.prerequisiteRule?.confidence,
    0.91,
  );
  assert.equal(
    planningCourseForAttempt(twelveUnitAttempt, snapshotCatalogue)?.name,
    "Historical twelve-unit COMP1100",
  );
  assert.equal(
    planningCourseForAttempt(
      { ...sixUnitAttempt, snapshotId: 999 },
      snapshotCatalogue,
    ),
    undefined,
  );
});

test("uses units stored on attempts instead of later snapshot units", () => {
  const course = {
    ...planningCourseByCode("COMP1100", demoCatalogue, 2026),
    snapshotId: 303,
    units: 12,
  };
  const snapshotCatalogue = {
    ...demoCatalogue,
    courses: demoCatalogue.courses.map((candidate) =>
      candidate.code === course.code && candidate.year === course.year
        ? course
        : candidate,
    ),
  };
  const completed = {
    id: "completed-variable-units",
    academicYear: 2026,
    courseCode: "COMP1100",
    snapshotId: 303,
    termId: "2026-s1",
    status: "completed",
    unitsAttempted: 3,
    unitsEarned: 3,
  };
  const enrolled = {
    id: "enrolled-variable-units",
    academicYear: 2026,
    courseCode: "COMP1600",
    termId: "2026-s2",
    status: "enrolled",
    unitsAttempted: 9,
    unitsEarned: 0,
  };

  assert.equal(
    degreeUnitProgress([completed], 144, snapshotCatalogue).completed,
    3,
  );
  const year = unitsByCalendarYear(
    [completed, enrolled],
    snapshotCatalogue,
  ).find((item) => item.year === 2026);
  assert.equal(year?.completed, 3);
  assert.equal(year?.planned, 9);
});

function attempt(id, courseCode, termId, status = "planned") {
  return {
    id,
    academicYear: Number(termId.slice(0, 4)),
    courseCode,
    termId,
    status,
  };
}

test("recommends first-year core courses for an empty Semester 1", () => {
  const recommended = recommendedCoursesForTerm(
    s1,
    [],
    major,
    demoCatalogue,
  ).map((course) => course.code);
  assert.deepEqual(recommended, ["COMP1100", "MATH1005"]);
});

test("does not recommend a course whose prerequisite is still missing", () => {
  const recommended = recommendedCoursesForTerm(
    s2,
    [],
    major,
    demoCatalogue,
  ).map((course) => course.code);
  assert.ok(recommended.includes("COMP1600"));
  assert.ok(recommended.includes("MATH1005"));
  assert.equal(recommended.includes("COMP1110"), false);
});

test("recommends COMP1110 once COMP1100 is sequenced earlier", () => {
  const recommended = recommendedCoursesForTerm(
    s2,
    [attempt("a1", "COMP1100", "2026-s1", "completed")],
    major,
    demoCatalogue,
  ).map((course) => course.code);
  assert.ok(recommended.includes("COMP1110"));
});

function verifiedCourseCondition(code, requirementMode = "completed") {
  return {
    kind: "course",
    code,
    minimumMark: null,
    requirementMode,
    hardness: "hard",
    reviewState: "verified",
    confidence: 1,
    sourceText: code,
  };
}

function catalogueWithPrerequisiteRule(relationalExpression) {
  return {
    ...demoCatalogue,
    courses: demoCatalogue.courses.map((course) =>
      course.code === "COMP1110" && course.year === 2026
        ? {
            ...course,
            prerequisiteCodes: ["COMP1100", "MATH1005"],
            prerequisiteRule: {
              confidence: 1,
              expression: null,
              hardness: "hard",
              relationalExpression,
              reviewState: "verified",
              sourceText: "Complete COMP1100 or MATH1005.",
            },
          }
        : course,
    ),
  };
}

test("evaluates a published any-of rule instead of requiring every reference", () => {
  const target = attempt("target", "COMP1110", "2026-s2");
  const structuredCatalogue = catalogueWithPrerequisiteRule({
    kind: "group",
    operator: "any_of",
    minimumCount: null,
    conditions: [
      verifiedCourseCondition("COMP1100"),
      verifiedCourseCondition("MATH1005"),
    ],
  });
  const attempts = [
    attempt("completed", "COMP1100", "2026-s1", "completed"),
    target,
  ];
  assert.deepEqual(missingPrereqs(target, attempts, structuredCatalogue), []);
  assert.equal(
    effectiveStatus(target, attempts, structuredCatalogue),
    "planned",
  );
});

test("only completed-or-concurrent course conditions accept the same term", () => {
  const target = attempt("target", "COMP1110", "2026-s2");
  const sameTerm = attempt("same", "COMP1100", "2026-s2");
  const completedOnly = catalogueWithPrerequisiteRule({
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [verifiedCourseCondition("COMP1100")],
  });
  assert.deepEqual(missingPrereqs(target, [sameTerm, target], completedOnly), [
    "COMP1100",
  ]);

  const concurrent = catalogueWithPrerequisiteRule({
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [
      verifiedCourseCondition("COMP1100", "completed_or_concurrent"),
    ],
  });
  assert.deepEqual(missingPrereqs(target, [sameTerm, target], concurrent), []);
});

test("keeps unreviewed or non-actionable requirements as manual approval", () => {
  const target = attempt("target", "COMP1110", "2026-s2");
  const structuredCatalogue = catalogueWithPrerequisiteRule({
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [
      {
        kind: "gpa",
        minimumGpa: 5,
        hardness: "hard",
        reviewState: "verified",
        confidence: 1,
        sourceText: "GPA of at least 5",
      },
    ],
  });
  assert.deepEqual(
    evaluateCoursePrerequisites(target, [target], structuredCatalogue),
    { state: "unknown", missingCodes: [] },
  );
  assert.equal(
    effectiveStatus(target, [target], structuredCatalogue),
    "approval",
  );
});

test("skips courses already in the plan", () => {
  const recommended = recommendedCoursesForTerm(
    s1,
    [attempt("a1", "COMP1100", "2026-s1")],
    major,
    demoCatalogue,
  ).map((course) => course.code);
  assert.equal(recommended.includes("COMP1100"), false);
  assert.ok(recommended.includes("MATH1005"));
});

test("adds a missing prerequisite to the latest earlier offering with space", () => {
  const blocked = attempt("blocked", "COMP2100", "2027-s1");
  const result = proposePrerequisiteFix(blocked, [blocked], demoCatalogue);
  assert.equal(result.ok, true);
  assert.ok(
    result.steps.some(
      (step) =>
        step.type === "add" &&
        step.courseCode === "COMP1110" &&
        step.termId === "2026-s2",
    ),
  );
  assert.ok(
    result.steps.some(
      (step) =>
        step.type === "add" &&
        step.courseCode === "COMP1100" &&
        step.termId === "2026-s1",
    ),
  );
});

test("does not move a selected course year into a different year", () => {
  const attempts = [
    attempt("done", "COMP1100", "2026-s1", "completed"),
    attempt("prereq", "COMP1110", "2027-s2"),
    attempt("blocked", "COMP2100", "2027-s1"),
  ];
  const result = proposePrerequisiteFix(attempts[2], attempts, demoCatalogue);
  assert.equal(result.ok, false);
  assert.match(result.message, /in 2027/i);
});

test("does not invent a fix when no earlier offering has space", () => {
  const attempts = [
    attempt("a1", "COMP1600", "2026-s2"),
    attempt("a2", "MATH1005", "2026-s2"),
    attempt("a3", "COMP2120", "2026-s2"),
    attempt("a4", "COMP2310", "2026-s2"),
    attempt("blocked", "COMP2100", "2027-s1"),
  ];
  const result = proposePrerequisiteFix(attempts[4], attempts, demoCatalogue);
  assert.equal(result.ok, false);
  assert.match(result.message, /No earlier/i);
});

test("does not offer a sequencing fix for approval-only issues", () => {
  const attemptWithApproval = {
    ...attempt("capstone", "COMP3900", "2028-s2"),
    permissionApproved: false,
  };
  const attempts = [
    attempt("a1", "COMP2100", "2027-s1", "completed"),
    attemptWithApproval,
  ];
  const result = proposePrerequisiteFix(
    attemptWithApproval,
    attempts,
    demoCatalogue,
  );
  assert.equal(result.ok, false);
});

test("reports empty degree progress without inventing mapped units", () => {
  const progress = degreeUnitProgress([], 144);
  assert.deepEqual(progress, {
    completed: 0,
    planned: 0,
    remaining: 144,
    mapped: 0,
    total: 144,
    percent: 0,
  });
});

test("treats a full semester as over capacity", () => {
  const attempts = [
    attempt("a1", "COMP1100", "2026-s1"),
    attempt("a2", "MATH1005", "2026-s1"),
    attempt("a3", "COMP2400", "2026-s1"),
    attempt("a4", "COMP2300", "2026-s1"),
  ];
  assert.equal(
    termHasCapacity(attempts, "2026-s1", 6, 1, undefined, demoCatalogue),
    false,
  );
  assert.equal(
    termHasCapacity(attempts, "unscheduled", 6, 1, undefined, demoCatalogue),
    true,
  );
});

test("course availability follows the catalogue sessions", () => {
  const course = { sessions: ["Semester 2"] };
  assert.equal(courseIsAvailable(course, "Semester 1"), false);
  assert.equal(courseIsAvailable(course, "Semester 2"), true);
  assert.equal(courseIsAvailable(course, "Later"), true);
});

test("groups completed and planned units by calendar year", () => {
  const series = unitsByCalendarYear(
    [
      attempt("a1", "COMP1100", "2026-s1", "completed"),
      attempt("a2", "COMP1600", "2026-s2"),
      attempt("a3", "COMP2100", "2027-s2"),
    ],
    demoCatalogue,
  );
  const year2026 = series.find((item) => item.year === 2026);
  const year2027 = series.find((item) => item.year === 2027);
  assert.equal(year2026?.completed, 6);
  assert.equal(year2026?.planned, 6);
  assert.equal(year2027?.planned, 6);
});

test("planning preserves minimum marks for completed and concurrent prerequisites", () => {
  const target = attempt("target-mark", "COMP1110", "2026-s2");
  const prerequisite = {
    ...verifiedCourseCondition("COMP1100", "completed_or_concurrent"),
    minimumMark: 60,
  };
  const catalogue = catalogueWithPrerequisiteRule(prerequisite);
  for (const [result, expected] of [
    [{ mark: 59 }, "blocked"],
    [{ mark: 60 }, "planned"],
    [{ resultCode: "CR" }, "planned"],
    [{ resultCode: "P" }, "blocked"],
    [{ resultCode: "PS" }, "approval"],
  ]) {
    const completed = {
      ...attempt("completed-mark", "COMP1100", "2026-s1", "completed"),
      ...result,
    };
    assert.equal(
      effectiveStatus(target, [completed, target], catalogue),
      expected,
    );
  }
  const enrolled = attempt(
    "concurrent-mark",
    "COMP1100",
    "2026-s2",
    "enrolled",
  );
  assert.equal(
    effectiveStatus(target, [enrolled, target], catalogue),
    "approval",
  );
});

test("subject course counts require distinct earlier courses and reject failed, concurrent and future attempts", () => {
  const target = attempt("target", "COMP1110", "2026-s2");
  const structured = catalogueWithPrerequisiteRule({
    kind: "subject_courses",
    subject: "COMP",
    minimumCount: 2,
    hardness: "hard",
    reviewState: "verified",
    confidence: 1,
    sourceText: "Two COMP courses",
  });
  structured.courses = structured.courses.map((course) => ({
    ...course,
    subject: course.code.slice(0, 4),
  }));
  const earlier = attempt("earlier", "COMP1100", "2026-s1", "completed");
  const other = attempt("other", "COMP1600", "2026-s1", "completed");
  assert.equal(
    effectiveStatus(target, [earlier, other, target], structured),
    "planned",
  );
  for (const candidate of [
    attempt("repeat", "COMP1100", "2026-s1", "completed"),
    { ...other, status: "failed" },
    { ...other, status: "withdrawn" },
    { ...other, termId: "2026-s2" },
    { ...other, termId: "2027-s1" },
    attempt("unrelated", "MATH1005", "2026-s1", "completed"),
  ]) {
    assert.equal(
      effectiveStatus(target, [earlier, candidate, target], structured),
      "approval",
    );
  }
});

function catalogueWithExclusion(condition) {
  return {
    ...demoCatalogue,
    courses: demoCatalogue.courses.map((course) =>
      course.code === "COMP1110" && course.year === 2026
        ? {
            ...course,
            prerequisiteRule: null,
            prerequisiteCodes: [],
            prerequisiteText: "",
            incompatibilityRule: {
              confidence: 1,
              expression: null,
              hardness: "hard",
              relationalExpression: condition,
              reviewState: "verified",
              sourceText: "Cannot concurrently enrol in COMP1100.",
            },
          }
        : course,
    ),
  };
}

test("concurrent planner exclusions reject overlapping active enrolment and allow history", () => {
  const condition = {
    kind: "incompatible_concurrent",
    code: "COMP1100",
    hardness: "hard",
    reviewState: "verified",
    confidence: 1,
    sourceText: "Cannot concurrently enrol in COMP1100.",
  };
  const catalogue = catalogueWithExclusion(condition);
  const target = attempt("target", "COMP1110", "2026-s2");
  for (const status of ["planned", "enrolled"]) {
    assert.equal(
      effectiveStatus(
        target,
        [attempt("other", "COMP1100", "2026-s2", status), target],
        catalogue,
      ),
      "approval",
    );
  }
  for (const status of ["completed", "failed", "withdrawn"]) {
    assert.equal(
      effectiveStatus(
        target,
        [attempt("other", "COMP1100", "2026-s1", status), target],
        catalogue,
      ),
      "planned",
    );
  }
  assert.equal(
    effectiveStatus(
      target,
      [attempt("other", "COMP1100", "2026-s1"), target],
      catalogue,
    ),
    "planned",
  );
  assert.equal(
    effectiveStatus(
      target,
      [attempt("other", "COMP1100", "unscheduled"), target],
      catalogue,
    ),
    "approval",
  );
  assert.equal(
    effectiveStatus(
      target,
      [attempt("other", "COMP1100", "2026-s2"), target],
      catalogueWithExclusion({ ...condition, hardness: "advisory" }),
    ),
    "planned",
  );
  const overlapping = {
    ...catalogue,
    terms: [
      ...catalogue.terms.map((term) =>
        term.id === "2026-s2"
          ? { ...term, startsOn: "2026-07-01", endsOn: "2026-11-30" }
          : term,
      ),
      {
        id: "2026-spring",
        year: 2026,
        name: "Spring Session",
        shortName: "Spring",
        dates: "",
        startsOn: "2026-10-01",
        endsOn: "2027-02-07",
      },
    ],
  };
  assert.equal(
    effectiveStatus(
      target,
      [attempt("other", "COMP1100", "2026-spring"), target],
      overlapping,
    ),
    "approval",
  );
  assert.equal(
    effectiveStatus(
      target,
      [attempt("other", "COMP1100", "2026-s1", "completed"), target],
      catalogueWithExclusion({ ...condition, kind: "incompatible" }),
    ),
    "approval",
  );
});
