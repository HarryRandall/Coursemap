import { describe, expect, test } from "vitest";
import { planRisks } from "../lib/coursemap/plan-risks.ts";
import {
  TD_TAG,
  effectiveTdDesignation,
  tdDesignationFromEvidence,
  tdUnitsForDesignation,
} from "../lib/coursemap/td-designation.ts";
import {
  planningCourseForAttempt,
  evaluateCoursePrerequisites,
} from "../lib/planner.ts";
import {
  requirementTreeProgress,
  requirementNodeKey,
  creditedAttempts,
  requirementBucketProgress,
  requirementBucketStatus,
} from "../lib/coursemap/requirement-progress.ts";
import {
  evaluateCondition,
  studentRecord,
} from "../lib/coursemap/requisite-evaluation.ts";

const sourceHash =
  "0a3bbdc568a37989b76a0c00dbfb5b92b22091978b379dba97742ce4ed9689c6";
const hash = "a".repeat(64);
const locator = `https://programsandcourses.anu.edu.au/data/CourseSearch/GetCourses?SelectedYear=2025&GraduateAttributes%5B2%5D=${encodeURIComponent(TD_TAG)}`;
function evidence(legacy = false, extra = {}) {
  return {
    field_path: "course.tags",
    method: "deterministic",
    confidence: 1,
    source_locator: locator,
    source_excerpt: JSON.stringify({
      sourceHash,
      retrievedAt: "2026-10-20T12:56:36.926973+00:00",
      planHash: hash,
      ...(legacy
        ? {
            repair:
              "Canonical ANU transdisciplinary tag on a separately guarded legacy version",
            code: "POLS3095",
            year: 2025,
            exactStoredLegacyHash: hash,
            exactReconstructedBeforeHash: hash,
            sourceProposalHash: hash,
            fullRawSnapshotSha256: hash,
          }
        : {
            repair: "Canonical ANU transdisciplinary designation",
            sourceExcerpt: JSON.stringify({
              code: "POLS3095",
              year: 2025,
              designation: TD_TAG,
            }),
          }),
      ...extra,
    }),
  };
}
function parsed(provenance, overrides = {}) {
  return tdDesignationFromEvidence({
    code: "POLS3095",
    year: 2025,
    tags: ["Transdisciplinary"],
    provenance,
    ...overrides,
  });
}
const historical = {
  trustedSnapshotIds: [8065, 7158, 7435],
  actualYearByAttemptId: { old: 2026, alias: 2027, comp: 2027 },
  designationByCourseYear: [
    { code: "INFS2005", year: 2026, status: "member" },
    { code: "CBEA3001", year: 2027, status: "member" },
    { code: "COMP2400", year: 2027, status: "member" },
  ],
};

describe("reviewed official TD evidence", () => {
  test("multiple tag authorities cannot resurrect an older positive without chronology", () => {
    const older = evidence();
    expect(
      parsed([
        older,
        { ...evidence(), source_excerpt: "invalid newer tag authority" },
      ]),
    ).toBe("unknown");
    expect(
      parsed([
        older,
        { ...evidence(), source_locator: locator.replace("2025", "2026") },
      ]),
    ).toBe("unknown");
    expect(
      parsed([
        older,
        {
          ...evidence(),
          field_path: "requirements",
          source_excerpt: "unrelated new prerequisite",
        },
      ]),
    ).toBe("member");
  });

  test.each([
    evidence(),
    evidence(false, { original294PlanHash: hash, rawClonePolicy: "preserved" }),
    evidence(true),
  ])("recognises each reviewed emitter format", (row) =>
    expect(parsed([row])).toBe("member"),
  );
  test("a preserved POLS23615 fact survives unrelated content hash changes", () =>
    expect(
      parsed([evidence(false, { afterHash: "old-unrelated-content" })]),
    ).toBe("member"));
  test("missing/removed tags do not resurrect proof or manufacture an actual-year overlay", () => {
    expect(parsed([evidence()], { tags: [] })).toBe("unknown");
    expect(parsed([], { tags: [TD_TAG] })).toBe("unknown");
    expect(parsed([])).toBe("unknown");
  });
  test.each([
    { ...evidence(), source_excerpt: "{bad" },
    { ...evidence(), source_locator: locator.replace("2025", "2026") },
    {
      ...evidence(),
      source_locator: locator.replace(
        "programsandcourses.anu.edu.au",
        "example.com",
      ),
    },
    { ...evidence(), method: "model" },
    { ...evidence(), confidence: 0.5 },
    evidence(false, { sourceHash: "invalid" }),
    evidence(false, { retrievedAt: "not-a-date" }),
    evidence(false, {
      sourceExcerpt: JSON.stringify({
        code: "POLS3001",
        year: 2025,
        designation: TD_TAG,
      }),
    }),
    evidence(false, { repair: "arbitrary mention" }),
    evidence(true, { year: 2026 }),
  ])("rejects malformed, unverified and mismatched authority", (row) =>
    expect(parsed([row])).toBe("unknown"),
  );
});

describe("per completed attempt, rather than per shared snapshot", () => {
  test.each([
    ["old", "INFS2005", 8065, 2026, []],
    ["alias", "CBEA3001", 7158, 2027, ["Transdisciplinary"]],
    ["comp", "COMP2400", 7435, 2027, ["Transdisciplinary"]],
  ])(
    "recovers the three real snapshot witnesses: %s",
    (id, code, snapshotId, snapshotYear, tags) => {
      expect(
        effectiveTdDesignation(
          {
            attemptId: id,
            code,
            status: "completed",
            snapshotId,
            snapshotYear,
            tags,
          },
          historical,
        ),
      ).toBe("member");
    },
  );
  test("saved 2027 native TD does not prove completed 2025 credit", () => {
    const attempt = {
      attemptId: "same",
      code: "COMP2400",
      status: "completed",
      snapshotId: 7435,
      snapshotYear: 2027,
      tags: [TD_TAG],
    };
    const context = {
      ...historical,
      actualYearByAttemptId: { same: 2025 },
      designationByCourseYear: [],
    };
    expect(effectiveTdDesignation(attempt, context)).toBe("unknown");
    expect(
      effectiveTdDesignation(attempt, {
        ...context,
        designationByCourseYear: [
          { code: attempt.code, year: 2025, status: "non_member" },
        ],
      }),
    ).toBe("non_member");
    expect(
      effectiveTdDesignation(attempt, {
        ...context,
        actualYearByAttemptId: {},
      }),
    ).toBe("unknown");
    expect(
      effectiveTdDesignation(attempt, {
        ...context,
        actualYearByAttemptId: { same: 2027 },
      }),
    ).toBe("member");
  });
  test("planned/enrolled/custom remain their existing path, not official inference by code coincidence", () => {
    const a = {
      attemptId: "comp",
      code: "COMP2400",
      status: "planned",
      snapshotId: 7435,
      snapshotYear: 2027,
      tags: [TD_TAG],
    };
    expect(effectiveTdDesignation(a, historical)).toBeUndefined();
    expect(
      effectiveTdDesignation({ ...a, status: "enrolled" }, historical),
    ).toBeUndefined();
    expect(
      effectiveTdDesignation(
        { ...a, status: "completed", snapshotId: 999 },
        historical,
      ),
    ).toBeUndefined();
    expect(tdUnitsForDesignation(6, undefined, [TD_TAG])).toEqual({
      confirmed: 6,
      unknown: 0,
    });
  });
});

function course(code, snapshotId, tags = [], year = 2027) {
  return {
    code,
    name: code,
    year,
    snapshotId,
    tags,
    units: 6,
    level: 2000,
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
function attempt(
  id,
  code,
  snapshotId,
  status = "completed",
  termId = "2025-s1",
) {
  return {
    id,
    courseCode: code,
    snapshotId,
    status,
    academicYear: 2027,
    termId,
    unitsEarned: 6,
  };
}
function condition(id, overrides = {}) {
  return {
    type: "condition",
    id,
    projectionKey: String(id),
    position: id,
    conditionKind: "tagged_units",
    scope: "degree",
    tag: TD_TAG,
    minimumUnits: 12,
    maximumUnits: null,
    minimumCourses: null,
    minimumLevel: null,
    maximumLevel: null,
    subjectCode: null,
    freeText: null,
    options: [],
    ...overrides,
  };
}
function group(children, overrides = {}) {
  return {
    type: "group",
    id: 100,
    projectionKey: "root",
    operator: "all_of",
    scope: "part",
    minimumUnits: null,
    maximumUnits: null,
    minimumCount: null,
    children,
    ...overrides,
  };
}
function fixture() {
  const courses = [
    course("COMP2001", 1, ["Science"]),
    course("COMP2002", 2, [TD_TAG, "Science"]),
  ];
  const attempts = [attempt("a", "COMP2001", 1), attempt("b", "COMP2002", 2)];
  const catalogue = {
    courses,
    terms: [{ id: "2025-s1", year: 2025 }],
    historicalTd: {
      trustedSnapshotIds: [1, 2],
      actualYearByAttemptId: { a: 2025, b: 2025 },
      designationByCourseYear: [
        { code: "COMP2001", year: 2025, status: "member" },
      ],
    },
  };
  return { courses, attempts, catalogue };
}
function progress(root, f, extra = {}) {
  return requirementTreeProgress({
    root,
    attempts: f.attempts,
    catalogue: f.catalogue,
    ...extra,
  });
}

describe("degree TD credit and uncertainty", () => {
  test("TD uncertainty cannot erase a definite 150-unit excess over a 144-unit degree cap", () => {
    const courses = Array.from({ length: 25 }, (_, i) =>
      course(`COMP${1001 + i}`, i + 1),
    );
    const attempts = courses.map((c, i) =>
      attempt(`earned-${i}`, c.code, c.snapshotId),
    );
    const catalogue = {
      courses,
      terms: [{ id: "2025-s1", year: 2025 }],
      historicalTd: {
        trustedSnapshotIds: courses.map((c) => c.snapshotId),
        actualYearByAttemptId: Object.fromEntries(
          attempts.map((a) => [a.id, 2025]),
        ),
        designationByCourseYear: [],
      },
    };
    const td = condition(1),
      total = condition(2, {
        conditionKind: "units_total",
        tag: null,
        minimumUnits: 144,
      });
    const root = group([total, td], {
      scope: "degree",
      minimumUnits: 144,
      maximumUnits: 144,
    });
    const result = requirementTreeProgress({ root, attempts, catalogue });
    expect(result.get(requirementNodeKey(td)).state).toBe("unmeasured");
    expect(result.get(requirementNodeKey(root))).toMatchObject({
      state: "over_limit",
      completedUnits: 150,
      maximumUnits: 144,
    });
  });

  test("insufficient unknown TD gives a bounded shortfall without claiming credit", () => {
    const f = fixture();
    f.attempts = [f.attempts[1]];
    const td = condition(1, {
        freeText: "12 units of transdisciplinary study",
      }),
      root = group([td]);
    const [bucket] = requirementBucketProgress({
      requirements: [
        {
          root,
          structureCode: "BCOMP",
          structureKind: "programme",
          unmodelled: [],
        },
      ],
      attempts: f.attempts,
      catalogue: f.catalogue,
    });
    expect(bucket.completedUnits).toBe(0);
    expect(requirementBucketStatus(bucket)).toEqual({
      status: "short",
      label: "6 to 12u short",
    });
    const risks = planRisks({
      buckets: [bucket],
      attempts: [],
      catalogue: f.catalogue,
      progress: {
        completed: 0,
        planned: 0,
        total: 144,
        remaining: 144,
        mapped: 0,
        percent: 0,
      },
    });
    expect(risks[0].detail).toBe(
      "6 to 12 units still to place against this requirement.",
    );
  });

  test("threshold-dependent TD review reaches the dashboard status and plan risk", () => {
    const f = fixture(),
      td = condition(1, { freeText: "12 units of transdisciplinary study" }),
      root = group([td]);
    const [bucket] = requirementBucketProgress({
      requirements: [
        {
          root,
          structureCode: "BCOMP",
          structureKind: "programme",
          unmodelled: [],
        },
      ],
      attempts: f.attempts,
      catalogue: f.catalogue,
    });
    expect(requirementBucketStatus(bucket)).toEqual({
      status: "review",
      label: "Review designation",
    });
    const risks = planRisks({
      buckets: [bucket],
      attempts: [],
      catalogue: f.catalogue,
      progress: {
        completed: 0,
        planned: 0,
        total: 144,
        remaining: 144,
        mapped: 0,
        percent: 0,
      },
    });
    expect(risks).toContainEqual(
      expect.objectContaining({
        severity: "info",
        detail:
          "6 completed units need their transdisciplinary designation checked.",
      }),
    );
    expect(
      requirementBucketStatus({ ...bucket, satisfiedByOverride: true }),
    ).toEqual({ status: "complete", label: "Marked satisfied" });
    expect(
      requirementBucketStatus({
        ...bucket,
        designationReview: {
          ...bucket.designationReview,
          affectsResult: false,
        },
      }).status,
    ).toBe("short");
  });

  test("unknown6 cannot change a maximum12 cap result", () => {
    const f = fixture();
    f.attempts = [f.attempts[1]];
    const cap = condition(1, { minimumUnits: null, maximumUnits: 12 }),
      root = group([cap]);
    const p = progress(root, f).get(requirementNodeKey(cap));
    expect(p.state).toBe("satisfied");
    expect(p.designationReview).toBeUndefined();
  });

  test("unrelated roots and known TD buckets do not trigger extra allocator work", () => {
    function measured(status, td = false) {
      const f = fixture();
      let reads = 0;
      Object.defineProperty(
        f.catalogue.historicalTd,
        "designationByCourseYear",
        {
          get() {
            reads++;
            return [
              { code: "COMP2001", year: 2025, status },
              { code: "COMP2002", year: 2025, status },
            ];
          },
        },
      );
      const root = group([condition(1, { tag: td ? TD_TAG : "Science" })]);
      requirementTreeProgress({
        root,
        attempts: f.attempts,
        catalogue: f.catalogue,
      });
      return reads;
    }
    expect(measured("unknown")).toBe(measured("non_member"));
    expect(measured("unknown", true)).toBeGreaterThan(
      measured("non_member", true),
    );
  });

  test("an uncertain TD maximum-zero cap cannot certify total degree completion", () => {
    const f = fixture();
    f.attempts = [f.attempts[1]];
    const cap = condition(1, { minimumUnits: null, maximumUnits: 0 });
    const total = condition(2, {
      conditionKind: "units_total",
      tag: null,
      minimumUnits: 6,
    });
    const root = group([cap, total]);
    const p = progress(root, f);
    expect(p.get(requirementNodeKey(cap)).state).toBe("unmeasured");
    expect(p.get(requirementNodeKey(cap)).designationReview.unknownUnits).toBe(
      6,
    );
    expect(p.get(requirementNodeKey(root)).state).toBe("unmeasured");
    expect(p.get(requirementNodeKey(cap)).completedUnits).toBe(0);
  });
  test("confirmed plus already planned TD keeps its scheduled state", () => {
    const f = fixture();
    f.courses.push(course("COMP2003", 3, [TD_TAG]));
    f.attempts.push(attempt("plan", "COMP2003", undefined, "planned"));
    const td = condition(1),
      p = progress(group([td]), f).get(requirementNodeKey(td));
    expect(p.completedUnits).toBe(6);
    expect(p.plannedUnits).toBe(6);
    expect(p.state).toBe("in_progress");
  });
  test("two attempts sharing a snapshot resolve different actual years independently", () => {
    const f = fixture();
    f.attempts = [
      f.attempts[0],
      { ...f.attempts[0], id: "repeat", termId: "2026-s1" },
    ];
    f.catalogue.historicalTd.actualYearByAttemptId.repeat = 2026;
    const major = condition(2, {
        conditionKind: "course_set_units",
        tag: null,
        scope: "part",
        minimumUnits: 12,
        maximumUnits: 12,
        options: [{ kind: "course", code: "COMP2001", maximumUnits: 12 }],
      }),
      td = condition(1);
    const p = progress(group([major, td]), f).get(requirementNodeKey(td));
    expect(p.completedUnits).toBe(6);
    expect(p.designationReview.unknownUnits).toBe(6);
    expect(p.state).toBe("unmeasured");
  });

  test("confirmed lower bound and uncertain upper bound coexist without mutating sealed tags", () => {
    const f = fixture(),
      before = structuredClone(f),
      td = condition(1),
      root = group([td]);
    const p = progress(root, f).get(requirementNodeKey(td));
    expect(p.completedUnits).toBe(6);
    expect(p.state).toBe("unmeasured");
    expect(p.designationReview.unknownUnits).toBe(6);
    expect(f).toEqual(before);
  });
  test("enough confirmed credit stays satisfied, while inadequate possible credit is not a false pass", () => {
    const f = fixture();
    f.catalogue.historicalTd.designationByCourseYear.push({
      code: "COMP2002",
      year: 2025,
      status: "member",
    });
    const td = condition(1),
      root = group([td]);
    expect(progress(root, f).get(requirementNodeKey(td)).state).toBe(
      "satisfied",
    );
    f.catalogue.historicalTd.designationByCourseYear = [];
    f.attempts = f.attempts.slice(0, 1);
    expect(progress(root, f).get(requirementNodeKey(td)).state).toBe(
      "not_started",
    );
  });
  test("same course may meet a major and a degree-wide TD condition, but total earned units do not grow", () => {
    const f = fixture(),
      major = condition(2, {
        conditionKind: "course_set_units",
        tag: null,
        scope: "part",
        minimumUnits: 6,
        options: [{ kind: "course", code: "COMP2001" }],
      }),
      td = condition(1, { minimumUnits: 6 }),
      root = group([major, td]);
    const p = progress(root, f);
    expect(p.get(requirementNodeKey(major)).completedUnits).toBe(6);
    expect(p.get(requirementNodeKey(td)).completedUnits).toBe(6);
    expect(
      creditedAttempts(f.attempts, f.catalogue).reduce(
        (n, e) => n + e.units,
        0,
      ),
    ).toBe(12);
  });
  test("manual requirement override retains precedence and exact credited units", () => {
    const f = fixture(),
      td = condition(1),
      root = group([td]);
    const override = {
      structureCode: "BCOMP",
      requirementKey: "1",
      reason: "approval",
      note: "Explicit college credit",
      creditedUnits: 12,
    };
    const p = progress(root, f, {
      structureCode: "BCOMP",
      overrides: [override],
    }).get(requirementNodeKey(td));
    expect(p.state).toBe("done-by-override");
    expect(p.override).toEqual(override);
    expect(p.designationReview).toBeUndefined();
  });
  test("degree caps exclude possible TD credit instead of inventing units", () => {
    const f = fixture(),
      td = condition(1),
      cap = condition(3, {
        conditionKind: "subject_units",
        tag: null,
        subjectCode: "COMP",
        minimumUnits: null,
        maximumUnits: 6,
      }),
      root = group([td, cap]);
    const p = progress(root, f).get(requirementNodeKey(td));
    expect(p.completedUnits).toBe(6);
    expect(p.designationReview).toBeUndefined();
    expect(p.state).not.toBe("satisfied");
  });
  test("repeat credit remains bounded by the allocated repeat allowance", () => {
    const f = fixture();
    f.attempts = [
      f.attempts[0],
      { ...f.attempts[0], id: "repeat", termId: "2025-s2" },
    ];
    f.catalogue.historicalTd.actualYearByAttemptId.repeat = 2025;
    const major = condition(2, {
        conditionKind: "course_set_units",
        tag: null,
        scope: "part",
        minimumUnits: 12,
        maximumUnits: 12,
        options: [{ kind: "course", code: "COMP2001", maximumUnits: 12 }],
      }),
      td = condition(1),
      root = group([major, td]);
    expect(progress(root, f).get(requirementNodeKey(td)).completedUnits).toBe(
      12,
    );
    major.options[0].maximumUnits = 6;
    expect(progress(root, f).get(requirementNodeKey(td)).completedUnits).toBe(
      6,
    );
  });
  test("planned2029 with selected2027 edition retains estimated planned progress, unlike completed2025", () => {
    const f = fixture();
    f.attempts = [
      attempt("future", "COMP2002", undefined, "planned", "2029-s1"),
    ];
    f.catalogue.terms.push({ id: "2029-s1", year: 2029 });
    const td = condition(1, { minimumUnits: 6 }),
      root = group([td]);
    expect(planningCourseForAttempt(f.attempts[0], f.catalogue).year).toBe(
      2027,
    );
    const p = progress(root, f).get(requirementNodeKey(td));
    expect(p.plannedUnits).toBe(6);
    expect(p.completedUnits).toBe(0);
    expect(p.designationReview).toBeUndefined();
  });
  test("non-TD Science progress is identical with or without the historical TD context", () => {
    const f = fixture(),
      science = condition(1, { tag: "Science" }),
      root = group([science]);
    expect(progress(root, f)).toEqual(
      progress(root, {
        ...f,
        catalogue: { ...f.catalogue, historicalTd: undefined },
      }),
    );
  });
});

test("requisite TD units expose uncertainty without changing other tag rules", () => {
  const student = studentRecord({
    attempts: [],
    completedCourses: [
      {
        code: "COMP2001",
        units: 6,
        tags: ["Science"],
        tdUnits: { confirmed: 6, unknown: 0 },
      },
      {
        code: "COMP2002",
        units: 6,
        tags: [TD_TAG, "Science"],
        tdUnits: { confirmed: 0, unknown: 6 },
      },
    ],
    programmeCodes: [],
  });
  expect(
    evaluateCondition({ kind: "tagged_units", tag: TD_TAG, units: 12 }, student)
      .status,
  ).toBe("unknown");
  expect(
    evaluateCondition(
      { kind: "tagged_units", tag: "Science", units: 12 },
      student,
    ).status,
  ).toBe("met");
  expect(
    evaluateCondition({ kind: "tagged_units", tag: TD_TAG, units: 6 }, student)
      .status,
  ).toBe("met");
});

test("future prerequisite checking also keeps historical TD uncertainty", () => {
  const f = fixture();
  const target = course("COMP3000", 3);
  target.prerequisiteRule = {
    reviewState: "verified",
    relationalExpression: {
      kind: "tagged_units",
      tag: TD_TAG,
      units: 12,
      hardness: "hard",
      reviewState: "verified",
      confidence: 1,
      sourceText: "12 TD units",
    },
  };
  f.courses.push(target);
  f.catalogue.terms.push({ id: "2026-s1", year: 2026 });
  const planned = attempt(
    "target",
    "COMP3000",
    undefined,
    "planned",
    "2026-s1",
  );
  expect(
    evaluateCoursePrerequisites(planned, [...f.attempts, planned], f.catalogue)
      .state,
  ).toBe("unknown");
});
