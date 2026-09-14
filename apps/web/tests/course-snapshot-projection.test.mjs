import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { extractAnuCourseCodes } from "../lib/course-import/course-codes.ts";
import { extractDeterministicCourse } from "../lib/course-import/deterministic.ts";
import { projectCourseSnapshot } from "../lib/course-import/project-snapshot.ts";
import { parseCourseSnapshotProjection } from "../lib/course-import/snapshot-projection-contract.ts";
import { applyRuleTreeToProjection } from "../lib/coursemap/course-snapshot-rule-projection.ts";
import { COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE } from "../lib/coursemap/course-import-query-shape.ts";
import { evaluateRequisiteExpression } from "../lib/coursemap/requisite-summary.ts";

const { readProjectionPrerequisiteRule } =
  await import("../lib/coursemap/published-courses.ts");

const sourceUrl = "https://programsandcourses.anu.edu.au/2026/course/COMP2400";
const html = await readFile(
  new URL(
    "./fixtures/course-import/anu-2026-comp2400-rich.html",
    import.meta.url,
  ),
  "utf8",
);
const extraction = extractDeterministicCourse({
  html,
  courseCode: "COMP2400",
  year: 2026,
  sourceUrl,
});

test("extracts exact ANU course codes with suffixes and deduplicates them", () => {
  assert.deepEqual(
    extractAnuCourseCodes(
      "COMP1600, comp1600 and LAWS1234A, not XCOMP1100, COMP11000 or COMP1100AB.",
    ),
    ["COMP1600", "LAWS1234A"],
  );
});

test("projects every rich field into natural-key relational rows", () => {
  const projection = projectCourseSnapshot(extraction);

  assert.equal(projection.courseCode, "COMP2400");
  assert.equal(projection.academicYear, 2026);
  assert.equal(projection.snapshot.unitValueKind, "fixed");
  assert.equal(projection.snapshot.units, 6);
  assert.deepEqual(
    projection.fees.map(({ position, audience, amount }) => ({
      position,
      audience,
      amount,
    })),
    [
      { position: 1, audience: "commonwealth_supported", amount: null },
      { position: 2, audience: "domestic", amount: 5520 },
      { position: 3, audience: "international", amount: 7020 },
    ],
  );
  assert.deepEqual(projection.areasOfInterest, [
    { position: 1, name: "Information Technology" },
    { position: 2, name: "Software Engineering" },
  ]);
  assert.equal(projection.attributes[0].sourceText.length > 0, true);
  assert.deepEqual(
    projection.offeringSessions.map(
      ({
        position,
        calendarYear,
        classNumber,
        enrolClosesOn,
        censusOn,
        sourceText,
      }) => ({
        position,
        calendarYear,
        classNumber,
        enrolClosesOn,
        censusOn,
        hasSourceText: sourceText.length > 0,
      }),
    ),
    [
      {
        position: 1,
        calendarYear: 2026,
        classNumber: "1234",
        enrolClosesOn: "2026-03-02",
        censusOn: "2026-03-31",
        hasSourceText: true,
      },
    ],
  );
  assert.deepEqual(projection.learningOutcomes, [
    { position: 1, body: "Design a normalised relational schema." },
    { position: 2, body: "Write and evaluate relational queries." },
  ]);
  assert.deepEqual(projection.assessmentOutcomes, [
    { assessmentPosition: 1, learningOutcomePosition: 1 },
    { assessmentPosition: 2, learningOutcomePosition: 1 },
    { assessmentPosition: 2, learningOutcomePosition: 2 },
  ]);
  assert.match(projection.projectionSha256, /^[0-9a-f]{64}$/);
});

test("projects deterministic prerequisite choices into graph references", () => {
  const projection = projectCourseSnapshot(extraction);
  const prerequisiteRoot = projection.ruleGroups.find(
    ({ key }) => key === "prerequisite:group:root",
  );

  assert.equal(prerequisiteRoot.operator, "any_of");
  assert.deepEqual(
    projection.ruleConditions
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ conditionKind, requiredCourseCode }) => ({
        conditionKind,
        requiredCourseCode,
      })),
    [
      { conditionKind: "course", requiredCourseCode: "COMP1100" },
      { conditionKind: "course", requiredCourseCode: "COMP1130" },
    ],
  );
  assert.deepEqual(
    projection.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["COMP1100", "COMP1130"],
  );
});

test("keeps lexical references when complex prerequisite logic falls back to raw wording", () => {
  const complex = structuredClone(extraction);
  complex.code = "COMP3600";
  complex.level = 3000;
  complex.offerings = complex.offerings.map((offering) => ({
    ...offering,
    classSummaryUrl: offering.classSummaryUrl?.replace("COMP2400", "COMP3600"),
  }));
  complex.requisites.prerequisiteText =
    "To enrol in COMP3600 you must have completed the following: 24 units of COMP coded courses AND (6 units of MATH OR COMP1600)";
  complex.requisites.prerequisiteRule = null;
  complex.requisites.unmodelledText = [];

  const projection = projectCourseSnapshot(complex);
  assert.deepEqual(
    projection.ruleConditions
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ conditionKind, freeText }) => ({ conditionKind, freeText })),
    [
      {
        conditionKind: "other",
        freeText: complex.requisites.prerequisiteText,
      },
    ],
  );
  assert.deepEqual(
    projection.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["COMP1600"],
  );
});

test("deduplicates lexical and semantic rule references", () => {
  const duplicate = structuredClone(extraction);
  duplicate.requisites.prerequisiteText =
    "Complete COMP1100 or COMP1130; COMP1100 is listed again for clarity.";

  const projection = projectCourseSnapshot(duplicate);
  assert.deepEqual(
    projection.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["COMP1100", "COMP1130"],
  );
});

test("keeps lexical incompatibility references when no condition was parsed", () => {
  const rawIncompatibility = structuredClone(extraction);
  rawIncompatibility.requisites.incompatibilityText =
    "You cannot enrol after completing LAWS1234A.";
  rawIncompatibility.requisites.incompatibilityCourseCodes = [];
  rawIncompatibility.requisites.softIncompatibilityCourseCodes = [];

  const projection = projectCourseSnapshot(rawIncompatibility);
  assert.deepEqual(
    projection.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "incompatibility")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["LAWS1234A"],
  );
  assert.equal(
    projection.ruleConditions.find(
      ({ ruleKey }) => ruleKey === "incompatibility",
    ).conditionKind,
    "other",
  );
});

test("manual raw-rule edits retain lexical references without inventing course conditions", () => {
  const projection = structuredClone(projectCourseSnapshot(extraction));
  delete projection.projectionSha256;
  const sourceText =
    "To enrol in this course you must complete 24 units of COMP courses and either 6 units of MATH or COMP1600.";
  const next = applyRuleTreeToProjection({
    hardness: "hard",
    kind: "prerequisite",
    projection,
    sourceText,
    tree: {
      type: "group",
      id: "prerequisite-root",
      operator: "all_of",
      minimumCount: null,
      children: [
        {
          type: "condition",
          id: "prerequisite-raw",
          kind: "other",
          freeText: sourceText,
        },
      ],
    },
  });

  assert.deepEqual(
    next.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["COMP1600"],
  );
  assert.deepEqual(
    next.ruleConditions
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ conditionKind, requiredCourseCode }) => ({
        conditionKind,
        requiredCourseCode,
      })),
    [{ conditionKind: "other", requiredCourseCode: null }],
  );
});

test("projection hash is stable and excludes extraction and source metadata", () => {
  const first = projectCourseSnapshot(extraction);
  const metadataOnly = structuredClone(extraction);
  metadataOnly.sourceUpdatedAt = "2026-08-29T00:00:00.000Z";
  metadataOnly.overallConfidence = 0.12;
  metadataOnly.evidence = [
    {
      fieldKey: "title",
      sourceLocator: "Heading",
      evidenceExcerpt: "Relational Databases",
      confidence: 0.12,
      method: "model",
    },
  ];
  metadataOnly.reviewItems = [
    {
      fieldKey: "title",
      kind: "ambiguous",
      severity: "warning",
      message: "An administrator should confirm the title.",
    },
  ];

  assert.equal(
    first.projectionSha256,
    projectCourseSnapshot(structuredClone(extraction)).projectionSha256,
  );
  assert.equal(
    first.projectionSha256,
    projectCourseSnapshot(metadataOnly).projectionSha256,
  );
});

test("projection hash changes for a semantic relational change", () => {
  const changed = structuredClone(extraction);
  changed.fees[1].amount += 1;
  assert.notEqual(
    projectCourseSnapshot(extraction).projectionSha256,
    projectCourseSnapshot(changed).projectionSha256,
  );
});

test("runtime projection validation rejects malformed nested admin payloads", () => {
  const projection = structuredClone(projectCourseSnapshot(extraction));
  delete projection.projectionSha256;
  assert.deepEqual(parseCourseSnapshotProjection(projection), projection);

  const nullFeeSource = structuredClone(projection);
  nullFeeSource.fees[0].sourceText = null;
  assert.throws(
    () => parseCourseSnapshotProjection(nullFeeSource),
    /fees\.0\.sourceText/,
  );

  const duplicateOutcomePosition = structuredClone(projection);
  duplicateOutcomePosition.learningOutcomes[1].position =
    duplicateOutcomePosition.learningOutcomes[0].position;
  assert.throws(
    () => parseCourseSnapshotProjection(duplicateOutcomePosition),
    /learningOutcomes.*contiguous positions/,
  );

  const missingRule = structuredClone(projection);
  missingRule.ruleCourseReferences[0].ruleKey = "permission";
  assert.throws(
    () => parseCourseSnapshotProjection(missingRule),
    /ruleCourseReferences.*saved rule/,
  );
});

test("refuses an offering outside the selected extraction year", () => {
  const futureOffering = structuredClone(extraction);
  futureOffering.offerings[0].calendarYear = 2027;
  assert.throws(
    () => projectCourseSnapshot(futureOffering),
    /calendarYear.*match the extraction year/,
  );

  assert.equal(
    projectCourseSnapshot(extraction).offeringSessions.every(
      ({ calendarYear }) => calendarYear === extraction.year,
    ),
    true,
  );
});

test("flattens nested rules without losing typed requisite semantics", () => {
  const nested = structuredClone(extraction);
  nested.requisites = {
    prerequisiteText:
      "Complete COMP1100 and one of COMP1130 or 12 COMP units, plus other requirements.",
    corequisiteText: null,
    incompatibilityText: "Incompatible with COMP6240.",
    prerequisiteRule: {
      op: "all_of",
      rules: [
        { op: "completed", courseCode: "COMP1100" },
        {
          op: "one_of",
          rules: [
            { op: "completed_or_concurrent", courseCode: "COMP1130" },
            {
              op: "min_units_from_subject",
              minimumUnits: 12,
              subjectCode: "COMP",
            },
          ],
        },
        {
          op: "min_units_from_courses",
          minimumUnits: 6,
          courseCodes: ["COMP1730", "COMP1710"],
        },
        { op: "year_standing", minimumYear: 2 },
        { op: "minimum_gpa", value: 5, scale: "anu7" },
        { op: "minimum_gpa", value: 70, scale: "wam100" },
        { op: "enrolled_in", programmeCode: "B-COMP" },
      ],
    },
    corequisiteRule: null,
    incompatibilityCourseCodes: ["COMP6240"],
    softIncompatibilityCourseCodes: ["COMP6250"],
    unmodelledText: ["An interview may also be required."],
  };

  const projection = projectCourseSnapshot(nested);
  const prerequisiteRoot = projection.ruleGroups.find(
    ({ key }) => key === "prerequisite:group:root",
  );
  const nestedChoice = projection.ruleGroups.find(
    ({ key }) => key === "prerequisite:group:1",
  );
  assert.deepEqual(prerequisiteRoot, {
    key: "prerequisite:group:root",
    ruleKey: "prerequisite",
    parentGroupKey: null,
    operator: "all_of",
    minimumCount: null,
    position: 0,
  });
  assert.equal(nestedChoice.parentGroupKey, prerequisiteRoot.key);
  assert.equal(nestedChoice.operator, "any_of");
  assert.equal(nestedChoice.position, 1);

  const completed = projection.ruleConditions.find(
    ({ requiredCourseCode }) => requiredCourseCode === "COMP1100",
  );
  const concurrent = projection.ruleConditions.find(
    ({ requiredCourseCode }) => requiredCourseCode === "COMP1130",
  );
  assert.equal(completed.courseRequirementMode, "completed");
  assert.equal(concurrent.courseRequirementMode, "completed_or_concurrent");
  assert.equal(concurrent.groupKey, nestedChoice.key);

  const courseSet = projection.ruleConditions.find(
    ({ conditionKind }) => conditionKind === "course_set_units",
  );
  assert.equal(courseSet.minimumUnits, 6);
  assert.deepEqual(
    projection.ruleConditionCourses.filter(
      ({ conditionKey }) => conditionKey === courseSet.key,
    ),
    [
      {
        conditionKey: courseSet.key,
        position: 1,
        sourceCourseCode: "COMP1710",
        sourceText: "At least 6 units from COMP1710, COMP1730",
      },
      {
        conditionKey: courseSet.key,
        position: 2,
        sourceCourseCode: "COMP1730",
        sourceText: "At least 6 units from COMP1710, COMP1730",
      },
    ],
  );
  assert.equal(
    projection.ruleConditions.find(
      ({ conditionKind }) => conditionKind === "year_standing",
    ).minimumYear,
    2,
  );
  assert.equal(
    projection.ruleConditions.find(
      ({ conditionKind }) => conditionKind === "gpa",
    ).minimumGpa,
    5,
  );
  assert.equal(
    projection.ruleConditions.find(
      ({ conditionKind }) => conditionKind === "wam",
    ).minimumWam,
    70,
  );
  assert.deepEqual(
    projection.ruleConditions.find(
      ({ conditionKind }) => conditionKind === "admission",
    ),
    {
      key: "prerequisite:condition:6",
      ruleKey: "prerequisite",
      groupKey: "prerequisite:group:root",
      position: 6,
      conditionKind: "admission",
      requiredCourseCode: null,
      requiredStructureCode: "B-COMP",
      minimumUnits: null,
      minimumMark: null,
      subjectCode: null,
      minimumCourseLevel: null,
      maximumCourseLevel: null,
      minimumGpa: null,
      minimumYear: null,
      minimumWam: null,
      freeText: null,
      courseRequirementMode: null,
      hardness: "hard",
      sourceText: "Enrolment in programme B-COMP",
    },
  );
  assert.equal(
    projection.ruleConditions.find(
      ({ requiredCourseCode }) => requiredCourseCode === "COMP6250",
    ).hardness,
    "advisory",
  );
  assert.equal(
    projection.ruleConditions.some(
      ({ conditionKind, sourceText }) =>
        conditionKind === "other" && sourceText.includes("interview"),
    ),
    true,
  );
  assert.deepEqual(
    projection.ruleCourseReferences
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ referencedCourseCode }) => referencedCourseCode),
    ["COMP1100", "COMP1130", "COMP1710", "COMP1730"],
  );
});

test("keeps programme enrolment evaluable through the published projection", () => {
  const programmeOnly = structuredClone(extraction);
  programmeOnly.requisites = {
    prerequisiteText: "Enrolment in programme B-COMP",
    corequisiteText: null,
    incompatibilityText: null,
    prerequisiteRule: { op: "enrolled_in", programmeCode: "B-COMP" },
    corequisiteRule: null,
    incompatibilityCourseCodes: [],
    softIncompatibilityCourseCodes: [],
    unmodelledText: [],
  };

  const projection = projectCourseSnapshot(programmeOnly);
  const publishedRule = readProjectionPrerequisiteRule({
    ...projection,
    rules: projection.rules.map((rule) => ({
      ...rule,
      confidence: 0.95,
      reviewState: "verified",
    })),
    ruleConditions: projection.ruleConditions.map((condition) => ({
      ...condition,
      confidence: 0.95,
      reviewState: "verified",
    })),
  });

  assert.deepEqual(publishedRule?.expression, {
    kind: "group",
    operator: "all_of",
    conditions: [
      {
        kind: "programme_enrolment",
        code: "B-COMP",
        name: "B-COMP",
      },
    ],
  });
  assert.equal(
    evaluateRequisiteExpression(publishedRule.expression, [], ["b-comp"])
      .satisfied,
    true,
  );
  assert.equal(
    evaluateRequisiteExpression(publishedRule.expression, [], []).satisfied,
    false,
  );
});

test("normalises variable unit options into explicit relational rows", () => {
  const variable = structuredClone(extraction);
  variable.unitValue = { kind: "variable", unitsOptions: [12, 6] };
  const projection = projectCourseSnapshot(variable);
  assert.deepEqual(projection.unitOptions, [
    { position: 1, units: 6, label: "6 units", sourceText: "6 units" },
    { position: 2, units: 12, label: "12 units", sourceText: "12 units" },
  ]);
  assert.equal(projection.snapshot.minimumUnits, 6);
  assert.equal(projection.snapshot.maximumUnits, 12);
});

test("uses the deployed snapshot relation columns in admin review queries", () => {
  assert.deepEqual(COURSE_SNAPSHOT_RELATIONAL_QUERY_SHAPE, {
    offeringOrder: "id",
    fieldEvidenceOrder: "field_key",
    conditionCoursesForeignKey: "condition_id",
  });
});

test("section edits preserve all other course fields and linked collections", async () => {
  const { collectionEditorValue, preparedProjection } =
    await import("../lib/coursemap/course-workspace-projection.ts");
  const original = projectCourseSnapshot(extraction);
  const fields = { ...original.snapshot, title: "Reviewed course title" };
  const saved = preparedProjection(
    { code: original.courseCode, year: original.academicYear },
    fields,
    collectionEditorValue(original),
  );
  assert.equal(saved.snapshot.title, "Reviewed course title");
  assert.equal(original.snapshot.title, extraction.title);
  for (const key of Object.keys(saved).filter(
    (key) => !["snapshot", "courseCode", "academicYear"].includes(key),
  )) {
    assert.deepEqual(saved[key], original[key], key);
  }
  assert.equal(
    saved.snapshot.sourceUpdatedAt,
    original.snapshot.sourceUpdatedAt,
  );
});

test("section edits reject broken assessment to learning outcome links", async () => {
  const { collectionEditorValue, preparedProjection } =
    await import("../lib/coursemap/course-workspace-projection.ts");
  const original = projectCourseSnapshot(extraction);
  const collections = JSON.parse(collectionEditorValue(original));
  collections.assessmentOutcomes = [
    { assessmentPosition: 999, learningOutcomePosition: 999 },
  ];
  assert.throws(
    () =>
      preparedProjection(
        { code: original.courseCode, year: original.academicYear },
        original.snapshot,
        JSON.stringify(collections),
      ),
    /must reference saved assessment and learning outcome positions/,
  );
});
