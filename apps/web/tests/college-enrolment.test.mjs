import assert from "node:assert/strict";
import { test } from "vitest";
import { collegeEnrolmentStatus } from "../lib/academic/college-enrolment.ts";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { courseCatalogueContent } from "../lib/catalogue/content.ts";
import {
  treeFromRequirementWrite,
  requirementWriteWithTree,
} from "../lib/catalogue-import/requirement-tree.ts";
import { validateReviewedTree } from "../lib/coursemap/requisite-conditions.ts";
import { readProjectionPrerequisiteRule } from "../lib/coursemap/published-courses.ts";
import { evaluateRule } from "../lib/coursemap/requisite-evaluation.ts";
import { evaluateCoursePrerequisites } from "../lib/planner.ts";

const COLLEGE = "ANU College of Arts and Social Sciences";
const programmes = [
  { code: "BTEST", college: COLLEGE },
  {
    code: "BCOMP",
    college: "ANU College of Engineering, Computing and Cybernetics",
  },
  { code: "UNKNOWN", college: null },
];

test.each([
  [["BTEST"], "met"],
  [["BCOMP"], "unmet"],
  [["BTEST", "BCOMP"], "met"],
  [["BTEST", "UNKNOWN"], "met"],
  [["BCOMP", "UNKNOWN"], "unknown"],
  [["MISSING"], "unknown"],
  [[], "unknown"],
])(
  "college eligibility for %j preserves missing affiliations",
  (codes, expected) => {
    assert.equal(collegeEnrolmentStatus(COLLEGE, codes, programmes), expected);
  },
);

test("college identity matching tidies formatting without guessing aliases or choosing a conflicting year", () => {
  assert.equal(
    collegeEnrolmentStatus(` ${COLLEGE.toUpperCase()} `, ["btest"], programmes),
    "met",
  );
  assert.equal(collegeEnrolmentStatus("CASS", ["BTEST"], programmes), "unmet");
  assert.equal(
    collegeEnrolmentStatus(
      COLLEGE,
      ["BTEST"],
      [...programmes, { code: "BTEST", college: "Different college" }],
    ),
    "unknown",
  );
  assert.equal(
    collegeEnrolmentStatus(
      COLLEGE,
      ["BTEST"],
      [...programmes, { code: "BTEST", college: null }],
    ),
    "unknown",
  );
});

function modelWithCollege() {
  const model = emptyCourseExtraction({
    code: "TSTA2001",
    year: 2024,
    title: "College eligibility test",
  });
  model.requisites.prerequisiteText = "You must be enrolled in a CASS degree.";
  model.requisites.prerequisiteRule = {
    op: "enrolled_in_college",
    college: COLLEGE,
  };
  return model;
}

test("college enrolment survives projection and editor saves as a hard typed condition", () => {
  const projection = projectCourseSnapshot(modelWithCollege());
  const content = courseCatalogueContent({ projection });
  const condition = content.requirements.conditions[0];
  assert.equal(condition.kind, "college_enrolment");
  assert.equal(condition.freeText, COLLEGE);
  assert.equal(condition.hardness, "hard");
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated);
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    modelWithCollege().requisites.prerequisiteText,
  );
  assert.equal(edited.conditions[0].kind, "college_enrolment");
  assert.equal(edited.conditions[0].freeText, COLLEGE);
  assert.equal("enrolmentMode" in edited.conditions[0], false);
  assert.equal(
    readProjectionPrerequisiteRule(projection).relationalExpression
      .conditions[0].college,
    COLLEGE,
  );
  assert.equal(
    validateReviewedTree({
      ...tree,
      children: [{ ...tree.children[0], freeText: " " }],
    }).message,
    "Condition 1: Enter the college's full source name.",
  );
});

test("permission approval cannot waive college enrolment in student or planner checks", () => {
  const prerequisiteRule = readProjectionPrerequisiteRule(
    projectCourseSnapshot(modelWithCollege()),
  );
  prerequisiteRule.reviewState = "verified";
  prerequisiteRule.relationalExpression.reviewState = "verified";
  prerequisiteRule.relationalExpression.conditions[0].reviewState = "verified";
  for (const [programmeCodes, expected] of [
    [["BTEST"], "met"],
    [["BCOMP"], "unmet"],
    [["UNKNOWN"], "unknown"],
  ]) {
    assert.equal(
      evaluateRule(prerequisiteRule.relationalExpression, {
        completed: new Map(),
        enrolled: new Set(),
        programmeCodes,
        programmeColleges: programmes,
        permissionApproved: true,
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      expected,
    );
    assert.equal(
      evaluateCoursePrerequisites(
        {
          id: "target",
          courseCode: "TSTA2001",
          academicYear: 2024,
          termId: "2024-s2",
          status: "planned",
          permissionApproved: true,
        },
        [],
        {
          courses: [
            { code: "TSTA2001", year: 2024, units: 6, prerequisiteRule },
          ],
          terms: [],
          programmeCodes,
          programmeColleges: programmes,
        },
      ).state,
      expected === "met"
        ? "satisfied"
        : expected === "unmet"
          ? "unsatisfied"
          : "unknown",
    );
  }
});

test("college identities absent from the source remain extraction errors", () => {
  const model = modelWithCollege();
  for (const [pageMarkdown, expected] of [
    [`${COLLEGE}\n\n${model.requisites.prerequisiteText}`, 0],
    [model.requisites.prerequisiteText, 1],
  ]) {
    const finalised = finaliseCourseExtraction({
      code: model.code,
      year: model.year,
      listingTitle: model.title,
      model,
      pageMarkdown,
      finishReason: "stop",
      responseError: null,
    });
    assert.equal(finalised.errorCount, expected);
  }
  model.requisites.prerequisiteRule.college = " ";
  assert.equal(validateCourseExtraction(model).success, false);
});
