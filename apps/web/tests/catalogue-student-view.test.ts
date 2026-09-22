import assert from "node:assert/strict";
import { test } from "vitest";

import {
  type CatalogueContent,
  emptyCatalogueContent,
} from "../lib/catalogue/content.ts";
import { courseDetailsFromWrite } from "../lib/coursemap/course-version-view.ts";

function draftCourse() {
  const content = emptyCatalogueContent({
    kind: "course",
    code: "COMP2700",
    academicYear: 2027,
    title: "Systems and Security",
  }) as Extract<CatalogueContent, { kind: "course" }>;
  content.course.details.description = "An unpublished description.";
  content.course.details.units = 6;
  content.course.details.level = 2000;
  content.course.details.school = "School of Computing";
  content.course.learningOutcomes = [
    { position: 1, body: "Reason about trust boundaries." },
  ];
  content.requirements = {
    rules: [
      {
        key: "prerequisite",
        hardness: "hard",
        sourceText: "COMP1100 or COMP1130",
        sourceLocator: null,
        reviewState: "verified",
        confidence: 1,
        position: 0,
      },
    ],
    groups: [
      {
        key: "prerequisite-root",
        ruleKey: "prerequisite",
        parentKey: null,
        label: null,
        description: null,
        operator: "any_of",
        minimumCount: null,
        minimumUnits: null,
        maximumUnits: null,
        sourceText: null,
        sourceLocator: null,
        position: 0,
      },
    ],
    conditions: [
      {
        key: "prerequisite-comp1100",
        ruleKey: "prerequisite",
        groupKey: "prerequisite-root",
        position: 0,
        kind: "course",
        itemCode: "COMP1100",
        itemKind: "course",
        structureKind: null,
        requirementMode: "completed",
        minimumMark: null,
        minimumUnits: null,
        maximumUnits: null,
        minimumCount: null,
        subjectCode: null,
        minimumLevel: null,
        maximumLevel: null,
        minimumYear: null,
        minimumGpa: null,
        minimumWam: null,
        tag: null,
        freeText: null,
        hardness: "hard",
        sourceText: "COMP1100",
        sourceLocator: null,
        reviewState: "verified",
        confidence: 1,
      },
    ],
    options: [],
    references: [
      {
        ruleKey: "prerequisite",
        code: "COMP1100",
        sourceText: "COMP1100",
        confidence: 1,
        reviewState: "verified",
      },
    ],
  };
  return content;
}

test("a draft reads as a course through the published mapping", () => {
  const course = courseDetailsFromWrite(draftCourse());
  assert.ok(course);
  assert.equal(course.code, "COMP2700");
  assert.equal(course.year, 2027);
  assert.equal(course.name, "Systems and Security");
  assert.equal(course.description, "An unpublished description.");
  assert.equal(course.units, 6);
  assert.equal(course.level, 2000);
  assert.equal(course.school, "School of Computing");
  assert.deepEqual(course.learningOutcomes, [
    { position: 1, body: "Reason about trust boundaries." },
  ]);
  assert.equal(course.prerequisiteText, "COMP1100 or COMP1130");
  // The codes come from the rule's own reference and from its wording, the
  // same way a published read builds them.
  assert.deepEqual(course.prerequisiteCodes, ["COMP1100", "COMP1130"]);
  assert.ok(course.prerequisiteRule);
});

test("a draft says it is a draft and admits what it cannot know", () => {
  const course = courseDetailsFromWrite(draftCourse());
  assert.ok(course);
  assert.equal(course.publicationStatus, "draft");
  // The reverse lookup runs over published courses only, so a draft must not
  // imply that nothing depends on it.
  assert.equal(course.unlocksAreKnown, false);
  assert.equal(course.snapshotId, undefined);
});

test("structure content is not mistaken for a course", () => {
  const structure = emptyCatalogueContent({
    kind: "major",
    code: "CSEC-MAJ",
    academicYear: 2027,
    title: "Cyber Security",
  });
  assert.equal(courseDetailsFromWrite(structure), null);
});
