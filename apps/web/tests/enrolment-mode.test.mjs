import assert from "node:assert/strict";
import { test } from "vitest";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { courseCatalogueContent } from "../lib/catalogue/content.ts";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression.ts";
import {
  treeFromRequirementWrite,
  requirementWriteWithTree,
} from "../lib/catalogue-import/requirement-tree.ts";
import { validateReviewedTree } from "../lib/coursemap/requisite-conditions.ts";
import { evaluateRule } from "../lib/coursemap/requisite-evaluation.ts";
import { readProjectionPrerequisiteRule } from "../lib/coursemap/published-courses.ts";
import { evaluateCoursePrerequisites } from "../lib/planner.ts";

function conditionalPermissionModel() {
  const model = emptyCourseExtraction({
    code: "CBEA2001",
    year: 2024,
    title: "Conditional permission test",
  });
  model.requisites.prerequisiteText =
    "24 units and programme enrolment. Flexible Double Degree students need school permission.";
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 24 },
      { op: "enrolled_in", programmeCode: "BFINN" },
      {
        op: "one_of",
        rules: [
          {
            op: "enrolment_mode",
            mode: "flexible_double_degree",
            matches: false,
          },
          {
            op: "all_of",
            rules: [
              {
                op: "enrolment_mode",
                mode: "flexible_double_degree",
                matches: true,
              },
              {
                op: "permission",
                sourceText:
                  "Please contact info.cbe@anu.edu.au for a permission code.",
              },
            ],
          },
        ],
      },
    ],
  };
  return model;
}

function contentAndExpression() {
  const projection = projectCourseSnapshot(conditionalPermissionModel());
  const content = courseCatalogueContent({ projection });
  const expression = requirementSliceExpression({
    rule: content.requirements.rules[0],
    ...content.requirements,
  });
  return { projection, content, expression };
}

test("enrolment scope survives model projection and editor roundtrip without making permission unconditional", () => {
  const { content, projection } = contentAndExpression();
  const modeConditions = content.requirements.conditions.filter(
    (condition) => condition.kind === "enrolment_mode",
  );
  assert.deepEqual(
    modeConditions.map(({ enrolmentMode, matchesEnrolmentMode }) => [
      enrolmentMode,
      matchesEnrolmentMode,
    ]),
    [
      ["flexible_double_degree", false],
      ["flexible_double_degree", true],
    ],
  );
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated);
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    conditionalPermissionModel().requisites.prerequisiteText,
  );
  assert.deepEqual(
    edited.conditions
      .filter((condition) => condition.kind === "enrolment_mode")
      .map(({ enrolmentMode, matchesEnrolmentMode }) => [
        enrolmentMode,
        matchesEnrolmentMode,
      ]),
    [
      ["flexible_double_degree", false],
      ["flexible_double_degree", true],
    ],
  );
  assert.equal(
    content.requirements.rules.some((rule) => rule.key === "permission"),
    false,
  );
  assert.equal(
    edited.conditions.find((condition) => condition.kind === "permission")
      .freeText,
    "Please contact info.cbe@anu.edu.au for a permission code.",
  );
  assert.ok(readProjectionPrerequisiteRule(projection).relationalExpression);
});

test.each([
  ["single_degree", false, 24, ["BFINN"], "met"],
  ["fixed_double_degree", false, 24, ["BFINN"], "met"],
  ["flexible_double_degree", false, 24, ["BFINN"], "partial"],
  ["flexible_double_degree", true, 24, ["BFINN"], "met"],
  [null, true, 24, ["BFINN"], "unknown"],
  [null, false, 24, ["BFINN"], "unknown"],
  ["single_degree", true, 6, ["BFINN"], "partial"],
  ["flexible_double_degree", true, 24, ["BCOMP"], "partial"],
])(
  "mode %s with permission %s retains compulsory units and enrolment",
  (enrolmentMode, permissionApproved, units, programmeCodes, expected) => {
    const { expression } = contentAndExpression();
    assert.equal(
      evaluateRule(expression, {
        completed: new Map([["COMP1100", { units, mark: 70 }]]),
        enrolled: new Set(),
        programmeCodes,
        enrolmentMode,
        permissionApproved,
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      expected,
    );
  },
);

test("planner evaluates mode independently of programme count and preserves unknown context", () => {
  const { projection } = contentAndExpression();
  const prerequisiteRule = readProjectionPrerequisiteRule(projection);
  prerequisiteRule.reviewState = "verified";
  function verify(expression) {
    if (expression.kind === "group") expression.conditions.forEach(verify);
    else expression.reviewState = "verified";
  }
  verify(prerequisiteRule.relationalExpression);
  // Isolate mode and permission here; programme admission remains separately enforced.
  prerequisiteRule.relationalExpression.conditions =
    prerequisiteRule.relationalExpression.conditions.filter(
      (condition) => condition.kind === "group",
    );
  const course = { code: "CBEA2001", year: 2024, units: 6, prerequisiteRule };
  const target = {
    id: "target",
    courseCode: "CBEA2001",
    academicYear: 2024,
    termId: "2024-s2",
    status: "planned",
    permissionApproved: false,
  };
  for (const [enrolmentMode, permissionApproved, state] of [
    ["single_degree", false, "satisfied"],
    ["fixed_double_degree", false, "satisfied"],
    ["flexible_double_degree", false, "unsatisfied"],
    ["flexible_double_degree", true, "satisfied"],
    [null, true, "unknown"],
  ]) {
    assert.equal(
      evaluateCoursePrerequisites({ ...target, permissionApproved }, [], {
        courses: [course],
        terms: [],
        enrolmentMode,
      }).state,
      state,
    );
  }
});

test("invalid or incomplete enrolment-mode model conditions are rejected", () => {
  for (const rule of [
    { op: "enrolment_mode", mode: "double", matches: true },
    { op: "enrolment_mode", mode: "single_degree" },
    { op: "enrolment_mode", mode: "single_degree", matches: "false" },
    { op: "enrolment_mode", mode: null, matches: false },
  ]) {
    const model = conditionalPermissionModel();
    model.requisites.prerequisiteRule = rule;
    assert.equal(validateCourseExtraction(model).success, false);
  }
});
