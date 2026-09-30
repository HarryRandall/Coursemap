import { expect, test } from "vitest";
import type { AcademicStructureRequirements } from "../lib/catalogue-import/kinds/structure/contract.ts";
import { preservesStudentManagedFundChoice } from "../lib/catalogue-import/kinds/structure/smf-choice.ts";

const pairedChoice =
  "FINM3009 Student Managed Fund and FINM3010 Student Managed Fund Extension (12 units*)";
const timing =
  "*Enrolment in the Student Managed Fund (SMF) courses requires 12 units over two consecutive semesters.";

const requirements: AcademicStructureRequirements = {
  sourceText: `${pairedChoice}\n${timing}`,
  sourceLocator: "Program Requirements",
  rule: {
    type: "group",
    key: "choice",
    operator: "any_of",
    minimumCount: null,
    scope: "part",
    title: null,
    sourceText: pairedChoice,
    sourceLocator: "Program Requirements",
    children: [
      {
        type: "condition",
        key: "paired-smf",
        conditionKind: "free_text",
        minimumUnits: null,
        maximumUnits: null,
        minimumCourses: null,
        courseCodes: [],
        structureKind: null,
        structureCodes: [],
        subjectCode: null,
        minimumLevel: null,
        maximumLevel: null,
        tag: null,
        freeText: pairedChoice,
        scope: "part",
        includesAnyCourse: false,
        sourceText: pairedChoice,
        sourceLocator: "Program Requirements",
      },
    ],
  },
  unmodelledText: [timing],
};

test("the paired SMF option stays unresolved until timing can be evaluated", () => {
  expect(preservesStudentManagedFundChoice(requirements)).toBe(true);
  expect(
    preservesStudentManagedFundChoice({ ...requirements, unmodelledText: [] }),
  ).toBe(false);
});

test("a course list cannot award the paired SMF option from either course alone", () => {
  const model = structuredClone(requirements);
  if (model.rule?.type !== "group") throw new Error("Expected a rule group.");
  const paired = model.rule.children[0]!;
  if (paired.type !== "condition") throw new Error("Expected a condition.");
  model.rule.children.push({
    ...paired,
    key: "unsafe-smf-list",
    conditionKind: "course_list",
    courseCodes: ["FINM3009", "FINM3010"],
    minimumUnits: 12,
    freeText: null,
  });
  expect(preservesStudentManagedFundChoice(model)).toBe(false);
  const listed = model.rule.children[1]!;
  if (listed.type !== "condition") throw new Error("Expected a course list.");
  listed.sourceText = "6 units from completion of courses from List 1.";
  expect(preservesStudentManagedFundChoice(model)).toBe(true);
});
