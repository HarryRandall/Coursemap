import { describe, expect, test } from "vitest";
import type { CourseRuleExpression } from "../lib/coursemap/course-types";
import type { Course } from "../lib/coursemap/types";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project";
import { courseCatalogueContent } from "../lib/catalogue/content";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression";
import {
  treeFromRequirementWrite,
  requirementWriteWithTree,
} from "../lib/catalogue-import/requirement-tree";
import { readProjectionPrerequisiteRule } from "../lib/coursemap/published-courses";
import { validateReviewedTree } from "../lib/coursemap/requisite-conditions";
import { courseMatchesFilter } from "../lib/academic/course-code";
import {
  evaluateCondition,
  evaluateRule,
  studentRecord,
} from "../lib/coursemap/requisite-evaluation";
import { evaluateCoursePrerequisites } from "../lib/planner";
import { requisiteSentence } from "../ui/courses/requisite-wording";

const base = {
  confidence: 1,
  hardness: "hard" as const,
  reviewState: "verified" as const,
  sourceText:
    "To enrol in this course you must have completed 12 units of 1000 level Sociology (SOCY) courses, which may include CRIM1001, or with permission of the convenor.",
};
const crim: Extract<CourseRuleExpression, { kind: "filtered_units" }> = {
  ...base,
  kind: "filtered_units",
  units: 12,
  subjects: ["SOCY"],
  levels: [1000],
  courseCodes: ["CRIM1001"],
  requirementMode: "completed",
};
function student(codes: string[], permissionApproved = false) {
  return {
    ...studentRecord({
      attempts: [],
      commencementYear: null,
      completedCourses: codes.map((code) => ({ code, units: 6 })),
      programmeCodes: [],
    }),
    permissionApproved,
  };
}

function storedFixture() {
  const model = emptyCourseExtraction({
    code: "CRIM2003",
    year: 2026,
    title: "Contemporary Criminology",
  });
  model.requisites.prerequisiteRule = {
    op: "min_units_matching",
    minimumUnits: 12,
    subjectCodes: ["SOCY"],
    levels: [1000],
    includeConcurrent: false,
  };
  model.requisites.prerequisiteText = base.sourceText;
  const projection = projectCourseSnapshot(model);
  // These rows model independently reviewed database data, not model output.
  for (const row of projection.ruleConditions) {
    Object.assign(row, { reviewState: "verified", confidence: 1 });
  }
  const filter = projection.ruleConditions.find(
    (row) => row.conditionKind === "filtered_units",
  )!;
  // The existing option table already stores named exceptions. No new import grammar is required.
  projection.ruleConditionCourses.push({
    conditionKey: filter.key,
    position: 1,
    sourceCourseCode: "CRIM1001",
    sourceText: base.sourceText,
  });
  const requirements = courseCatalogueContent({ projection }).requirements;
  return { projection, requirements };
}

describe("named exceptions in course-unit prerequisites", () => {
  test.each([
    ["SOCY1001", true],
    ["SOCY2001", false],
    ["CRIM1001", true],
    ["CRIM1002", false],
    ["invalid", false],
  ])(
    "matches %s against the subject/level OR exact exception",
    (code, matches) => {
      expect(
        courseMatchesFilter(code as string, {
          subjectCodes: ["SOCY"],
          courseLevels: [1000],
          includeCourseCodes: ["CRIM1001"],
        }),
      ).toBe(matches);
    },
  );
  test("CRIM2003 counts CRIM1001 alongside SOCY1000-level credit, without admitting unrelated courses", () => {
    expect(
      evaluateCondition(crim, student(["SOCY1001", "CRIM1001"])).status,
    ).toBe("met");
    expect(
      evaluateCondition(crim, student(["SOCY2001", "CRIM1001"])),
    ).toMatchObject({ status: "partial", measure: { value: 6, target: 12 } });
    expect(
      evaluateCondition(crim, student(["SOCY1001", "CRIM1002"])),
    ).toMatchObject({ status: "partial", measure: { value: 6, target: 12 } });
  });
  test("a course matching both routes contributes its credit once", () => {
    expect(
      evaluateCondition(
        { ...crim, courseCodes: ["SOCY1001"] },
        student(["SOCY1001"]),
      ),
    ).toMatchObject({ status: "partial", measure: { value: 6, target: 12 } });
  });
  test("concurrent exceptions count only where the existing rule allows concurrent units", () => {
    const record = {
      ...student(["SOCY1001"]),
      enrolled: new Set(["CRIM1001"]),
      enrolledUnits: new Map([["CRIM1001", 6]]),
    };
    expect(
      evaluateCondition(
        { ...crim, requirementMode: "completed_or_concurrent" },
        record,
      ).status,
    ).toBe("met");
    expect(evaluateCondition(crim, record).status).toBe("partial");
  });
  test("HIST2070 preserves HIST/CLAS union and explicitly named ECHI/EURO alternatives", () => {
    const hist = {
      ...crim,
      subjects: ["HIST", "CLAS"],
      levels: null,
      courseCodes: ["ECHI1006", "EURO1004"],
    };
    for (const codes of [
      ["HIST1001", "ECHI1006"],
      ["CLAS1001", "EURO1004"],
      ["ECHI1006", "EURO1004"],
    ])
      expect(evaluateCondition(hist, student(codes)).status).toBe("met");
    expect(
      evaluateCondition(hist, student(["HIST1001", "ECON1001"])).status,
    ).not.toBe("met");
  });
  test("permission alternatives and separate native exclusions retain their scope", () => {
    const root: CourseRuleExpression = {
      ...base,
      kind: "group",
      operator: "all_of",
      minimumCount: null,
      conditions: [
        {
          ...base,
          kind: "group",
          operator: "any_of",
          minimumCount: null,
          conditions: [
            crim,
            {
              ...base,
              kind: "permission",
              text: "Permission of the convenor.",
            },
          ],
        },
        { ...base, kind: "incompatible", code: "SOCY3016" },
      ],
    };
    expect(evaluateRule(root, student([], true)).status).toBe("met");
    expect(
      evaluateRule(root, student(["SOCY1001", "CRIM1001", "SOCY3016"], true))
        .status,
    ).not.toBe("met");
  });
  test("existing course-count and filtered-unit rules without exceptions are unchanged", () => {
    expect(
      evaluateCondition(
        { ...crim, courseCodes: undefined },
        student(["SOCY1001", "CRIM1001"]),
      ).status,
    ).toBe("partial");
    expect(
      evaluateCondition(
        {
          ...base,
          kind: "course_count",
          subjects: ["SOCY"],
          levels: [1000],
          minimumCount: 2,
          requirementMode: "completed",
        },
        student(["SOCY1001", "CRIM1001"]),
      ).status,
    ).toBe("partial");
  });
});

describe("publication and review preserve the stored option union", () => {
  test("both projection and canonical readers retain the exact course options", () => {
    const { projection, requirements } = storedFixture();
    expect(requirements.options.map((row) => row.code)).toEqual(["CRIM1001"]);
    for (const rule of [
      readProjectionPrerequisiteRule(projection)?.relationalExpression,
      requirementSliceExpression(requirements),
    ])
      expect(rule).toMatchObject({
        kind: "group",
        conditions: [
          {
            kind: "filtered_units",
            subjects: ["SOCY"],
            levels: [1000],
            courseCodes: ["CRIM1001"],
          },
        ],
      });
  });
  test("an unchanged reviewed tree survives validation and write/read roundtrip", () => {
    const { requirements } = storedFixture(),
      tree = treeFromRequirementWrite(requirements, "prerequisite");
    if (!tree) throw new Error("Expected a prerequisite tree.");
    const result = validateReviewedTree(tree);
    if (!("tree" in result)) throw new Error(result.message);
    const edited = requirementWriteWithTree(
      requirements,
      "prerequisite",
      result.tree,
      base.sourceText,
    );
    expect(edited.options.map((row) => row.code)).toEqual(["CRIM1001"]);
    expect(
      evaluateRule(
        requirementSliceExpression(edited)!,
        student(["SOCY1001", "CRIM1001"]),
      ).status,
    ).toBe("met");
  });
  test.each([
    { courseCodes: ["invalid"] },
    { courseCodes: ["CRIM1001", "crim1001"] },
  ])(
    "rejects invalid or duplicate reviewed exception identities",
    ({ courseCodes }) => {
      const { requirements } = storedFixture(),
        tree = treeFromRequirementWrite(requirements, "prerequisite")!;
      const condition = tree.children.find((row) => row.type === "condition")!;
      if (condition.type !== "condition")
        throw new Error("Expected a condition.");
      condition.courseCodes = courseCodes;
      expect(validateReviewedTree(tree)).toHaveProperty("message");
    },
  );
  test("wording makes the exact exception visible", () => {
    expect(requisiteSentence(crim)).toContain(
      "SOCY courses at 1000 level or CRIM1001",
    );
  });
  test("the planner and course-page evaluator agree for qualifying mixed credit", () => {
    const { projection } = storedFixture(),
      rule = readProjectionPrerequisiteRule(projection)!;
    const course = (code: string): Course => ({
      code,
      name: code,
      year: 2026,
      units: 6,
      level: 1000,
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
    });
    const history = ["SOCY1001", "CRIM1001"].map((code) => ({
      id: code,
      courseCode: code,
      academicYear: 2026,
      termId: "2026-s1",
      status: "completed" as const,
      unitsEarned: 6,
    }));
    const target = {
      id: "target",
      courseCode: "CRIM2003",
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned" as const,
    };
    const catalogue = {
      courses: [
        course("SOCY1001"),
        course("CRIM1001"),
        { ...course("CRIM2003"), prerequisiteRule: rule },
      ],
      terms: [
        {
          id: "2026-s1",
          year: 2026,
          name: "Semester1",
          shortName: "S1",
          dates: "",
        },
        {
          id: "2026-s2",
          year: 2026,
          name: "Semester2",
          shortName: "S2",
          dates: "",
        },
      ],
    };
    expect(
      evaluateCoursePrerequisites(target, [...history, target], catalogue)
        .state,
    ).toBe("satisfied");
  });
});
