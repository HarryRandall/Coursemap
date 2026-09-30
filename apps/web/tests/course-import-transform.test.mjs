import { unsupportedModelWording } from "../lib/catalogue-import/model-evidence.ts";
import { rejectedModelValueSummary } from "../lib/catalogue-import/model-extraction.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  stableFingerprint,
  stableStringify,
} from "../lib/catalogue-import/canonical.ts";
import {
  COURSE_CODE_PATTERN,
  validateCourseExtraction,
} from "../lib/catalogue-import/kinds/course/contract.ts";
import { COURSE_EXTRACTION_JSON_SCHEMA } from "../lib/catalogue-import/kinds/course/schema.ts";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import {
  canonicaliseCourseModelExtraction,
  courseModelCanonicalisationReviewItem,
} from "../lib/catalogue-import/kinds/course/model-canonical.ts";
import { buildCourseExtractionUserPrompt } from "../lib/catalogue-import/kinds/course/prompt.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { courseKindAdapter } from "../lib/catalogue-import/kinds/course/adapter.ts";
import { courseCatalogueContent } from "../lib/catalogue/content.ts";
import {
  catalogueReviewUnits,
  reviewUnitEvidence,
} from "../lib/catalogue/review-units.ts";
import { classifyFirstRead } from "../lib/catalogue/first-read.ts";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression.ts";
import {
  treeFromRequirementWrite,
  requirementWriteWithTree,
} from "../lib/catalogue-import/requirement-tree.ts";
import { evaluateRule } from "../lib/coursemap/requisite-evaluation.ts";
import { requirementTreeFromSource } from "../lib/coursemap/requirement-write-tree.ts";
import { conditionSummary } from "../ui/requirements/requirement-presentation.ts";
import { programmeCodeForName } from "../lib/catalogue-import/kinds/course/programmes.ts";

// A complete, valid extraction of the reduced COMP2400 page in
// fixtures/course-import, in the shape the model returns.
const extraction = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/course-import/anu-2026-comp2400-extraction.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const pageMarkdown = JSON.stringify(extraction);

test("unmodelled eligibility wording creates an explicit blocking review item", () => {
  const wording =
    "A student with a fail grade (N, NCN, WN) in the preceding semester is ineligible to apply.";
  const model = structuredClone(extraction);
  model.requisites.prerequisiteText = wording;
  model.requisites.unmodelledText = [wording];
  model.reviewItems = [];

  const result = finaliseCourseExtraction({
    code: "COMP2400",
    year: 2026,
    listingTitle: model.title,
    model,
    pageMarkdown: `${pageMarkdown}\n${wording}`,
    finishReason: "stop",
    responseError: null,
  });
  assert.deepEqual(result.extraction.requisites.unmodelledText, [wording]);
  assert.ok(
    result.extraction.reviewItems.some(
      (item) =>
        item.fieldKey === "requisites.unmodelledText" &&
        item.severity === "error" &&
        item.message.includes(wording),
    ),
  );
  const content = courseKindAdapter.project(result.extraction);
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.prerequisite",
    )?.band,
    "needs_review",
  );
});

test("career and recent-unit GPA alternatives survive import projection and reviewer editing", () => {
  const model = structuredClone(extraction);
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 72 },
      {
        op: "one_of",
        rules: [
          {
            op: "minimum_gpa",
            value: 5,
            scale: "anu7",
            recentGradedUnits: null,
          },
          { op: "minimum_gpa", value: 5, scale: "anu7", recentGradedUnits: 48 },
        ],
      },
    ],
  };
  model.requisites.unmodelledText = [
    "A student with a fail grade in the preceding semester is ineligible to apply.",
  ];
  assert.equal(validateCourseExtraction(model).success, true);
  const projection = projectCourseSnapshot(model);
  const gpaRows = projection.ruleConditions.filter(
    (row) => row.conditionKind === "gpa",
  );
  assert.deepEqual(
    gpaRows.map((row) => row.minimumCount),
    [null, 48],
  );
  const content = courseCatalogueContent({ projection });
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.prerequisite",
    )?.band,
    "needs_review",
  );
  const expression = requirementSliceExpression(
    content.requirements,
    "prerequisite",
  );
  assert.deepEqual(
    expression.conditions[0].conditions[1].conditions.map(
      (condition) => condition.recentGradedUnits,
    ),
    [null, 48],
  );
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  assert.deepEqual(
    tree.children[1].children.map((condition) => condition.recentGradedUnits),
    [undefined, 48],
  );
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    tree,
    "GPA eligibility",
  );
  assert.deepEqual(
    edited.conditions
      .filter((condition) => condition.kind === "gpa")
      .map((condition) => condition.minimumCount),
    [null, 48],
  );
  const display = requirementTreeFromSource(
    content.requirements,
    "prerequisite",
  );
  assert.deepEqual(display.children[1].children.map(conditionSummary), [
    "A grade point average of at least 5 across the academic career",
    "A grade point average of at least 5 over the most recent 48 graded units",
  ]);
});

test("a conditional school qualification remains under review rather than requiring MATH1003 for everyone", () => {
  // https://programsandcourses.anu.edu.au/2024/course/MATH1113
  const clause =
    "For students with a level of maths equivalent to ACT Mathematical Methods, MATH1003 is required to be completed before enrolling.";
  const model = structuredClone(extraction);
  model.requisites.prerequisiteText = clause;
  model.requisites.prerequisiteRule = null;
  model.requisites.unmodelledText = [clause];
  assert.equal(validateCourseExtraction(model).success, true);
  const projection = projectCourseSnapshot(model);
  const prerequisiteConditions = projection.ruleConditions.filter(
    (condition) => condition.ruleKey === "prerequisite",
  );
  assert.deepEqual(
    prerequisiteConditions.map((condition) => condition.conditionKind),
    ["other"],
  );
  assert.equal(
    prerequisiteConditions.some(
      (condition) => condition.requiredCourseCode === "MATH1003",
    ),
    false,
  );
  const content = courseCatalogueContent({ projection });
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.prerequisite",
    )?.band,
    "needs_review",
  );
});

test("unnamed equivalent courses remain an alternative requiring review", () => {
  const model = structuredClone(extraction);
  model.requisites.prerequisiteText =
    "To enrol in this course you must have completed or concurrent enrolment in STAT2101/2111 Microeconomics 2 (P or H) or equivalent.";
  model.requisites.prerequisiteRule = {
    op: "one_of",
    rules: [
      { op: "completed_or_concurrent", courseCode: "STAT2101" },
      { op: "completed_or_concurrent", courseCode: "STAT2111" },
      { op: "equivalent_course", sourceText: "or equivalent" },
    ],
  };
  model.requisites.unmodelledText = [];
  assert.equal(validateCourseExtraction(model).success, true);
  const projection = projectCourseSnapshot(model);
  assert.deepEqual(
    projection.ruleConditions
      .filter((condition) => condition.ruleKey === "prerequisite")
      .map((condition) => [condition.conditionKind, condition.freeText]),
    [
      ["course", null],
      ["course", null],
      ["other", "or equivalent"],
    ],
  );
  const content = courseCatalogueContent({ projection });
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.prerequisite",
    )?.band,
    "needs_review",
  );
  const expression = requirementSliceExpression(
    content.requirements,
    "prerequisite",
  );
  const reader = {
    completed: new Map(),
    enrolled: new Set(),
    programmeCodes: [],
    gpa: null,
    wam: null,
    studyYear: null,
  };
  assert.equal(evaluateRule(expression, reader).status, "unknown");
  assert.equal(
    evaluateRule(expression, {
      ...reader,
      enrolled: new Set(["STAT2111"]),
    }).status,
    "met",
  );
});

test("invalid model course levels are reported rather than silently accepted", () => {
  assert.deepEqual(
    COURSE_EXTRACTION_JSON_SCHEMA.properties.level.enum,
    [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000],
  );
  for (const level of [2400, 2, 1000, null, undefined]) {
    const model = { ...structuredClone(extraction), level };
    if (level === undefined) delete model.level;
    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(validation.issues.some(({ path }) => path === "$.level"));
    const result = finaliseCourseExtraction({
      code: "COMP2400",
      year: 2026,
      listingTitle: extraction.title,
      model,
      pageMarkdown,
      finishReason: "stop",
      responseError: null,
    });
    assert.equal(result.extraction.level, 2000);
    assert.ok(
      result.extraction.reviewItems.some(
        (item) => item.fieldKey === "level" && item.severity === "error",
      ),
    );
    assert.ok(
      result.report.droppedFields.some((item) => item.fieldKey === "level"),
    );
  }
  const suffixed = emptyCourseExtraction({
    code: "COMP2400A",
    year: 2026,
    title: extraction.title,
  });
  assert.equal(validateCourseExtraction(suffixed).success, true);
});

// The actual STAT2001 provider response and ANU page captured on 28 September
// 2026. The programme identity is supplied by ANU's 2026 directory.
const stat2001 = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/course-import/anu-2026-stat2001-model.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const stat2001Markdown = await readFile(
  new URL("./fixtures/course-import/anu-2026-stat2001.txt", import.meta.url),
  "utf8",
);
const knownProgrammes = [
  { code: "BADAN", name: "Bachelor of Applied Data Analytics" },
];

test("resolves STAT2001's programme identity without losing its AND/OR tree", () => {
  const original = structuredClone(stat2001);
  const result = finaliseCourseExtraction({
    code: "STAT2001",
    year: 2026,
    listingTitle: stat2001.title,
    model: stat2001,
    pageMarkdown: stat2001Markdown,
    finishReason: "stop",
    responseError: null,
    knownProgrammes,
  });
  assert.equal(result.errorCount, 3);
  assert.ok(
    result.extraction.reviewItems.some(
      (item) => item.fieldKey === "level" && item.severity === "error",
    ),
  );
  assert.ok(
    result.extraction.reviewItems.some(
      (item) =>
        item.fieldKey === "sourceUpdatedAt" && item.severity === "error",
    ),
  );
  assert.equal(result.warningCount, 0);
  const expected = structuredClone(stat2001.requisites.prerequisiteRule);
  expected.rules[0].rules[2].programmeCode = "BADAN";
  assert.deepEqual(result.extraction.requisites.prerequisiteRule, expected);
  assert.deepEqual(stat2001, original);
  assert.equal(
    result.report.canonicalisationChanges[0].rule,
    "programme_name_to_code",
  );
  const projection = projectCourseSnapshot(result.extraction);
  assert.deepEqual(
    projection.ruleGroups
      .filter((group) => group.ruleKey === "prerequisite")
      .map((group) => group.operator),
    ["all_of", "any_of", "any_of"],
  );
  assert.equal(
    projection.ruleConditions.find(
      (condition) => condition.conditionKind === "admission",
    ).requiredStructureCode,
    "BADAN",
  );
});

test("programme resolution requires an exact and unambiguous name", () => {
  assert.equal(
    programmeCodeForName(
      " bachelor of applied data analytics ",
      knownProgrammes,
    ),
    "BADAN",
  );
  assert.equal(
    programmeCodeForName(
      "Bachelor of Applied Data Analytics (Honours)",
      knownProgrammes,
    ),
    undefined,
  );
  assert.equal(
    programmeCodeForName("Bachelor of Applied Data Analytics", [
      ...knownProgrammes,
      { code: "OTHER", name: knownProgrammes[0].name },
    ]),
    undefined,
  );
  const result = finaliseCourseExtraction({
    code: "STAT2001",
    year: 2026,
    listingTitle: stat2001.title,
    model: stat2001,
    pageMarkdown: stat2001Markdown,
    finishReason: "stop",
    responseError: null,
    knownProgrammes: [],
  });
  assert.equal(result.errorCount, 4);
  const projection = projectCourseSnapshot(result.extraction);
  assert.equal(
    projection.ruleConditions.filter(
      (condition) => condition.ruleKey === "prerequisite",
    ).length,
    1,
  );
});

test("supplies year-specific programme identities in the model prompt", () => {
  const prompt = buildCourseExtractionUserPrompt({
    expectedCode: "STAT2001",
    academicYear: 2026,
    pageMarkdown: stat2001Markdown,
    knownProgrammes: [
      ...knownProgrammes,
      { code: "BARTS", name: "Bachelor of Arts" },
    ],
  });
  assert.ok(
    prompt.includes(
      "ANU programme identities for 2026:\nBADAN: Bachelor of Applied Data Analytics",
    ),
  );
  assert.ok(!prompt.includes("BARTS: Bachelor of Arts"));
  const ruleSchema = COURSE_EXTRACTION_JSON_SCHEMA.$defs.rule.oneOf.find(
    (rule) => rule.properties?.op?.const === "enrolled_in",
  );
  const pattern = new RegExp(ruleSchema.properties.programmeCode.pattern);
  assert.ok(pattern.test("BADAN"));
  assert.ok(!pattern.test(knownProgrammes[0].name));
});

test("missing confidence stays unknown and distinct incompatibilities need no review", () => {
  const result = finaliseCourseExtraction({
    code: "STAT2001",
    year: 2026,
    listingTitle: stat2001.title,
    model: stat2001,
    pageMarkdown: stat2001Markdown,
    finishReason: "stop",
    responseError: null,
    knownProgrammes,
  });
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(result.extraction),
  });
  const item = classifyFirstRead(content).find(
    (item) => item.fieldPath === "requirements.incompatibility",
  );
  assert.equal(item.confidence, null);
  assert.equal(item.band, "accepted");
  assert.ok(
    content.requirements.conditions.every(
      (condition) => condition.confidence === 0,
    ),
  );
  content.evidence = [
    {
      fieldPath: "requisites.incompatibilityCourseCodes",
      confidence: 0.8,
      method: "model",
      sourceLocator: null,
      sourceExcerpt: "Incompatible with STAT2013 and STAT6013.",
    },
  ];
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.incompatibility",
    ).confidence,
    0.8,
  );
});

function finalise(model, overrides = {}) {
  return finaliseCourseExtraction({
    code: "COMP2400",
    year: 2026,
    listingTitle: "Relational Databases",
    model,
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
    ...overrides,
  });
}

test("keeps a requisite rule the model reads from a semicolon list", () => {
  const model = structuredClone(extraction);
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "completed", courseCode: "PHYS2001" },
      { op: "completed", courseCode: "PHYS2002" },
      {
        op: "one_of",
        rules: [
          { op: "completed", courseCode: "PHYS2003" },
          { op: "completed", courseCode: "PHYS3011" },
        ],
      },
    ],
  };
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  assert.deepEqual(
    finalised.requisites.prerequisiteRule,
    model.requisites.prerequisiteRule,
  );
  const projection = projectCourseSnapshot(finalised);
  assert.deepEqual(
    projection.ruleConditions
      .filter(({ ruleKey }) => ruleKey === "prerequisite")
      .map(({ requiredCourseCode }) => requiredCourseCode),
    ["PHYS2001", "PHYS2002", "PHYS2003", "PHYS3011"],
  );
});

test("a malformed rule costs only the rule, not the requisite wording", () => {
  const model = structuredClone(extraction);
  model.requisites.prerequisiteRule = { op: "completed", courseCode: "nope" };
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(finalised.requisites.prerequisiteRule, null);
  assert.equal(
    finalised.requisites.prerequisiteText,
    extraction.requisites.prerequisiteText,
  );
  assert.equal(errorCount, 1);
  assert.ok(
    finalised.reviewItems.some(
      ({ fieldKey, severity }) =>
        fieldKey === "requisites.prerequisiteRule" && severity === "error",
    ),
  );
});

test("never takes identity from the model and falls back to the listing title", () => {
  const model = structuredClone(extraction);
  model.code = "COMP9999";
  model.year = 2027;
  model.level = 9000;
  delete model.title;
  const { extraction: finalised } = finalise(model);
  assert.equal(finalised.code, "COMP2400");
  assert.equal(finalised.year, 2026);
  assert.equal(finalised.level, 2000);
  assert.equal(finalised.subjectCode, "COMP");
  assert.equal(finalised.title, "Relational Databases");
});

test("keeps evidence whatever method the model wrote", () => {
  const model = structuredClone(extraction);
  model.evidence = model.evidence.map((item) => ({
    ...item,
    method: "deterministic",
  }));
  const { extraction: finalised } = finalise(model);
  assert.equal(finalised.evidence.length, extraction.evidence.length);
  assert.ok(finalised.evidence.every(({ method }) => method === "model"));
});

test("keeps failed response diagnostics without permitting source persistence", () => {
  const {
    extraction: finalised,
    errorCount,
    canPersist,
  } = finalise(null, {
    responseError:
      "OpenRouter returned invalid JSON despite structured-output mode.",
  });
  assert.equal(canPersist, false);
  assert.equal(finalised.title, "Relational Databases");
  assert.deepEqual(finalised.offerings, []);
  assert.ok(errorCount >= 2);
  assert.ok(
    finalised.reviewItems.some(({ message }) =>
      message.includes("invalid JSON"),
    ),
  );
});

test("accepts ANU's single-letter course variants throughout the extraction contract", () => {
  for (const code of [
    "COMP8900F",
    "COMP8900P",
    "EXTN1001A",
    "ACST4600T",
    "TOKP2001X",
  ]) {
    assert.equal(COURSE_CODE_PATTERN.test(code), true, code);
  }
  assert.equal(COURSE_CODE_PATTERN.test("COMP8900FF"), false);
  assert.equal(
    COURSE_EXTRACTION_JSON_SCHEMA.properties.code.pattern,
    "^[A-Z]{4}[0-9]{4}[A-Z]?$",
  );

  const variant = structuredClone(extraction);
  variant.code = "COMP8900F";
  variant.level = 8000;
  variant.offerings[0].classSummaryUrl =
    "https://programsandcourses.anu.edu.au/course/COMP8900F/First%20Semester/1234";
  variant.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "completed", courseCode: "COMP8900P" },
      {
        op: "min_units_from_courses",
        minimumUnits: 6,
        courseCodes: ["EXTN1001A", "ACST4600T"],
      },
    ],
  };
  variant.requisites.incompatibilityCourseCodes = ["TOKP2001X"];
  variant.relatedCourses = [
    {
      position: 1,
      relationKind: "equivalent",
      courseCode: "COMP8900P",
      courseTitle: "Research Project",
      sourceText: "Equivalent to COMP8900P.",
    },
  ];

  const result = validateCourseExtraction(variant, {
    expectedCode: "COMP8900F",
    expectedYear: 2026,
  });
  assert.equal(result.success, true, JSON.stringify(result.issues));
});

test("runtime contract rejects unknown keys and future-year offering rows", () => {
  const withUnknown = structuredClone(extraction);
  withUnknown.hallucinated = true;
  const unknownResult = validateCourseExtraction(withUnknown);
  assert.equal(unknownResult.success, false);
  assert.ok(unknownResult.issues.some(({ path }) => path === "$.hallucinated"));

  const withFutureOffering = structuredClone(extraction);
  withFutureOffering.offerings[0].calendarYear = 2027;
  const futureResult = validateCourseExtraction(withFutureOffering);
  assert.equal(futureResult.success, false);
  assert.ok(
    futureResult.issues.some(
      ({ path, message }) =>
        path === "$.offerings[0].calendarYear" && message.includes("match"),
    ),
  );
});

test("advertises exact model formats in the JSON Schema", () => {
  assert.equal(
    COURSE_EXTRACTION_JSON_SCHEMA.properties.schemaVersion.const,
    "course-extraction.v2",
  );
  assert.deepEqual(COURSE_EXTRACTION_JSON_SCHEMA.$defs.nullableDate, {
    type: ["string", "null"],
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  });
  assert.equal(
    COURSE_EXTRACTION_JSON_SCHEMA.$defs.offering.properties.startsOn.$ref,
    "#/$defs/nullableDate",
  );
  assert.equal(
    COURSE_EXTRACTION_JSON_SCHEMA.$defs.offering.properties.classSummaryUrl
      .$ref,
    "#/$defs/nullableAnuClassSummaryUrl",
  );
});

test("blocks a college-degree prerequisite omitted behind conditional permission", () => {
  const model = emptyCourseExtraction({
    code: "ARTS2001",
    year: 2026,
    title: "Test Arts Course",
  });
  const clause =
    "24 units of study and must be enrolled in a CASS degree. Please note if you're in a Flexible Double Degree with a CASS program, you will need a permission code to enrol into this course";
  const pageMarkdown = `# ${model.title}\n\nOffered by the ANU College of Arts and Social Sciences\n\n## Requisite and Incompatibility\n\n${clause}\n\n## Prescribed Texts\n`;
  model.requisites.prerequisiteText = clause;
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 24 },
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
              { op: "permission", sourceText: clause },
            ],
          },
        ],
      },
    ],
  };
  const finaliseModel = () =>
    finaliseCourseExtraction({
      code: model.code,
      year: model.year,
      listingTitle: model.title,
      model,
      pageMarkdown,
      finishReason: "stop",
      responseError: null,
    });
  const omitted = finaliseModel();
  assert.equal(omitted.report.missingCollegeEnrolment, true);
  assert.equal(omitted.errorCount, 1);
  assert.ok(
    omitted.extraction.reviewItems.some(
      (item) =>
        item.fieldKey === "requisites.prerequisiteRule" &&
        item.severity === "error" &&
        item.message.includes("college degree"),
    ),
  );
  assert.equal(
    classifyFirstRead(courseKindAdapter.project(omitted.extraction)).find(
      (item) => item.fieldPath === "requirements.prerequisite",
    )?.band,
    "needs_review",
  );
  model.requisites.prerequisiteRule.rules.push({
    op: "enrolled_in_college",
    college: "ANU College of Arts and Social Sciences",
  });
  const complete = finaliseModel();
  assert.equal(complete.report.missingCollegeEnrolment, false);
  assert.equal(
    complete.extraction.reviewItems.some((item) =>
      item.message.includes("modelled rule omits"),
    ),
    false,
  );
});

test("canonicalises bounded provider formats without changing the raw response", () => {
  const raw = structuredClone(extraction);
  raw.evidence = [];
  raw.reviewItems = [];
  Object.assign(raw.offerings[0], {
    startsOn: "23 Feb 2026",
    lastEnrolmentDate: "2 March 2026",
    censusDate: "31 Mar 2026",
    endsOn: "29 May 2026",
    classSummaryUrl: "COMP2400",
  });
  const before = structuredClone(raw);
  const providerValidation = validateCourseExtraction(raw, {
    expectedCode: "COMP2400",
    expectedYear: 2026,
  });
  assert.equal(providerValidation.success, false);
  assert.equal(providerValidation.issues.length, 5);

  const canonical = canonicaliseCourseModelExtraction(raw, {
    expectedCode: "COMP2400",
    expectedYear: 2026,
  });
  assert.deepEqual(raw, before);
  assert.equal(canonical.changes.length, 5);
  assert.deepEqual(canonical.value.offerings[0], {
    ...before.offerings[0],
    startsOn: "2026-02-23",
    lastEnrolmentDate: "2026-03-02",
    censusDate: "2026-03-31",
    endsOn: "2026-05-29",
    classSummaryUrl: null,
  });
  assert.equal(
    validateCourseExtraction(canonical.value, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
    }).success,
    true,
  );

  const reviewItem = courseModelCanonicalisationReviewItem(canonical.changes);
  assert.equal(reviewItem?.severity, "warning");
  assert.match(reviewItem?.message ?? "", /5 provider formatting values/);

  const finalised = finaliseCourseExtraction({
    code: "COMP2400",
    year: 2026,
    listingTitle: "Relational Databases",
    model: raw,
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
  }).extraction;
  assert.equal(finalised.offerings[0].classSummaryUrl, null);
  assert.equal(finalised.offerings[0].startsOn, "2026-02-23");
  const projection = projectCourseSnapshot(finalised);
  assert.equal(projection.offeringSessions[0].startsOn, "2026-02-23");
});

test("leaves ambiguous or impossible model dates invalid", () => {
  for (const value of [
    "03/04/2026",
    "3 Apr 26",
    "31 Feb 2026",
    "29 Feb 2026",
    "3 Apr 2027",
    "2026-02-31",
    "2027-04-03",
    "Tomorrow",
  ]) {
    const model = structuredClone(extraction);
    model.evidence = [];
    model.offerings[0].startsOn = value;
    const canonical = canonicaliseCourseModelExtraction(model, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
    });
    assert.equal(canonical.changes.length, 0, value);
    const result = validateCourseExtraction(canonical.value, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
    });
    assert.equal(result.success, false, value);
    assert.ok(
      result.issues.some(({ path }) => path === "$.offerings[0].startsOn"),
      value,
    );
  }
});

test("leaves untrusted class summary references invalid", () => {
  for (const value of [
    "COMP2500",
    "http://programsandcourses.anu.edu.au/course/COMP2400/First%20Semester/1234",
    "//programsandcourses.anu.edu.au/course/COMP2400/First%20Semester/1234",
    "/course/COMP2400/First%20Semester/1234",
    "javascript:alert(1)",
    "data:text/plain,COMP2400",
    "https://evil.example/course/COMP2400/First%20Semester/1234",
    "https://programsandcourses.anu.edu.au/course/COMP2500/First%20Semester/1234",
    "https://programsandcourses.anu.edu.au/2025/course/COMP2400/First%20Semester/1234",
    "https://programsandcourses.anu.edu.au/2026/course/COMP2400/First%20Semester/5678",
    "https://programsandcourses.anu.edu.au/2026/course/COMP2400/Second%20Semester/1234",
    "https://programsandcourses.anu.edu.au/2026/course/COMP2400/Unknown%20Session/1234",
    "https://programsandcourses.anu.edu.au.evil.example/course/COMP2400/First%20Semester/1234",
    "https://user@programsandcourses.anu.edu.au/course/COMP2400/First%20Semester/1234",
    "https://programsandcourses.anu.edu.au/course/COMP2400/First%20Semester/not-a-class",
  ]) {
    const model = structuredClone(extraction);
    model.evidence = [];
    model.offerings[0].classSummaryUrl = value;
    const canonical = canonicaliseCourseModelExtraction(model, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
    });
    assert.equal(canonical.changes.length, 0, value);
    const result = validateCourseExtraction(canonical.value, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
    });
    assert.equal(result.success, false, value);
    assert.ok(
      result.issues.some(
        ({ path }) => path === "$.offerings[0].classSummaryUrl",
      ),
      value,
    );
  }

  const valid = canonicaliseCourseModelExtraction(extraction, {
    expectedCode: "COMP2400",
    expectedYear: 2026,
  });
  assert.deepEqual(valid.changes, []);
  assert.equal(validateCourseExtraction(valid.value).success, true);

  const yearSpecific = structuredClone(extraction);
  yearSpecific.offerings[0].classSummaryUrl =
    "https://programsandcourses.anu.edu.au/2026/course/COMP2400/First%20Semester/1234";
  assert.equal(validateCourseExtraction(yearSpecific).success, true);

  yearSpecific.offerings[0].classSummaryUrl =
    "https://programsandcourses.anu.edu.au/2026/course/COMP2400/Semester%201/1234";
  assert.equal(validateCourseExtraction(yearSpecific).success, true);
});

test("stable serialisation and fingerprints ignore object key insertion order", () => {
  const left = { b: 2, a: { d: 4, c: 3 }, list: [2, 1] };
  const right = { list: [2, 1], a: { c: 3, d: 4 }, b: 2 };
  assert.equal(stableStringify(left), stableStringify(right));
  assert.equal(stableFingerprint(left), stableFingerprint(right));
  assert.notEqual(
    stableFingerprint(left),
    stableFingerprint({ ...right, list: [1, 2] }),
  );
});

test("tags collapse case-insensitive repeats and stay out of content when empty", () => {
  const tagged = projectCourseSnapshot(
    finalise({
      ...extraction,
      tags: ["Science", " science ", "Research  Project"],
    }).extraction,
  );
  assert.deepEqual(tagged.tags, [
    { position: 1, name: "Science" },
    { position: 2, name: "Research Project" },
  ]);
  assert.deepEqual(courseCatalogueContent({ projection: tagged }).course.tags, [
    { position: 1, name: "Science" },
    { position: 2, name: "Research Project" },
  ]);

  // Content written before tags must hash the same as content with none.
  const untagged = courseCatalogueContent({
    projection: projectCourseSnapshot(finalise(extraction).extraction),
  });
  assert.equal("tags" in untagged.course, false);
  assert.equal(
    catalogueReviewUnits(untagged).some(
      ({ fieldPath }) => fieldPath === "course.tags",
    ),
    false,
  );
});

test("the user prompt offers the tags already in use", () => {
  const prompt = buildCourseExtractionUserPrompt({
    expectedCode: "comp2400",
    academicYear: 2026,
    knownTags: ["Science", "Engineering"],
    pageMarkdown: "# COMP2400",
  });
  assert.match(prompt, /Known tags: Science; Engineering\n/u);
  assert.ok(
    buildCourseExtractionUserPrompt({
      expectedCode: "comp2400",
      academicYear: 2026,
      pageMarkdown: "# COMP2400",
    }).startsWith(
      "Expected course: COMP2400\nSelected academic year: 2026\nRecognised academic periods for 2026:\nNone configured. Flag every offering session for review.\n\n# COMP2400\n",
    ),
  );
});

test("counting tags use the exact reviewed vocabulary while suggestions stay reviewable", () => {
  const model = structuredClone(extraction);
  model.tags = [
    "Transdisciplinary",
    "Transdisciplinary Problem-Solving",
    "Work Integrated Learning",
  ];
  const knownTags = ["Transdisciplinary Problem-Solving"];
  const checked = validateCourseExtraction(model, { knownTags });
  assert.equal(checked.success, false);
  assert.deepEqual(
    checked.issues.map(({ path }) => path),
    ["$.tags[0]", "$.tags[2]"],
  );
  const finalised = finaliseCourseExtraction({
    code: model.code,
    year: model.year,
    listingTitle: model.title,
    model,
    knownTags,
    pageMarkdown: JSON.stringify(model),
    finishReason: "stop",
    responseError: null,
  });
  assert.deepEqual(finalised.extraction.tags, knownTags);
  assert.equal(finalised.errorCount, 2);
  assert.match(
    finalised.extraction.reviewItems[0].message,
    /Transdisciplinary.*recognised tag/,
  );
  assert.deepEqual(projectCourseSnapshot(finalised.extraction).tags, [
    { position: 1, name: knownTags[0] },
  ]);

  model.tags = [];
  model.reviewItems = [
    {
      fieldKey: "tags",
      kind: "unsupported",
      severity: "warning",
      message:
        'Suggested category "Applied Statistics"; source: "Students analyse practical data sets".',
    },
  ];
  const suggested = finaliseCourseExtraction({
    code: model.code,
    year: model.year,
    listingTitle: model.title,
    model,
    knownTags: [],
    pageMarkdown: JSON.stringify(model),
    finishReason: "stop",
    responseError: null,
  });
  assert.equal(suggested.errorCount, 0);
  assert.equal(suggested.warningCount, 1);
  assert.deepEqual(suggested.extraction.tags, []);
  assert.equal(projectCourseSnapshot(suggested.extraction).tags.length, 0);
  assert.equal(
    suggested.extraction.reviewItems[0].message,
    model.reviewItems[0].message,
  );
  assert.equal(
    validateCourseExtraction({ ...model, tags: ["Science"] }, { knownTags: [] })
      .success,
    false,
  );
  assert.equal(
    validateCourseExtraction(
      { ...model, tags: ["transdisciplinary problem-solving"] },
      { knownTags },
    ).success,
    false,
  );
});

test("refuses empty objects and truncated responses even when they parse", () => {
  assert.equal(finalise({}).canPersist, false);
  for (const finishReason of ["length", "error", "content_filter"]) {
    assert.equal(finalise(extraction, { finishReason }).canPersist, false);
  }
  assert.equal(finalise(extraction).canPersist, true);
});

test("missing model fields remain errors rather than source absences", () => {
  const model = structuredClone(extraction);
  delete model.requisites;
  const result = finalise(model);
  assert.equal(result.canPersist, true);
  assert.ok(
    result.extraction.reviewItems.some(
      (item) => item.fieldKey === "requisites" && item.severity === "error",
    ),
  );
});

test("level prerequisite filters reject invalid subjects and reversed bounds", () => {
  for (const rule of [
    { maximumLevel: 500, subjectCode: "COMP" },
    { maximumLevel: 1000, subjectCode: "Computer Science" },
  ]) {
    const model = structuredClone(extraction);
    model.requisites.prerequisiteRule = {
      op: "min_units_at_level",
      minimumUnits: 6,
      level: 1000,
      ...rule,
    };
    assert.equal(validateCourseExtraction(model).success, false);
  }
  const model = structuredClone(extraction);
  model.requisites.prerequisiteRule = {
    op: "min_units_at_level",
    minimumUnits: 6,
    level: 1000,
  };
  assert.equal(validateCourseExtraction(model).success, true);
  assert.equal(
    projectCourseSnapshot(model).ruleConditions.find(
      (item) => item.ruleKey === "prerequisite",
    ).subjectCode,
    null,
  );
});

test("the captured COMP2410 model response preserves both total units and the subject-level filter", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-comp2410-requisites.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = {
    ...emptyCourseExtraction({
      code: "COMP2410",
      year: 2024,
      title: "Networked Information Systems",
    }),
    requisites: captured.requisites,
  };
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
  });
  const conditions = content.requirements.conditions.filter(
    (item) => item.ruleKey === "prerequisite",
  );
  assert.equal(
    conditions.find((item) => item.kind === "units_total").minimumUnits,
    48,
  );
  const filter = conditions.find((item) => item.kind === "level_units");
  assert.deepEqual(
    [
      filter.minimumUnits,
      filter.subjectCode,
      filter.minimumLevel,
      filter.maximumLevel,
    ],
    [6, "COMP", 1000, 1000],
  );
  const rule = requirementSliceExpression({
    rule: content.requirements.rules.find(
      (item) => item.key === "prerequisite",
    ),
    groups: content.requirements.groups.filter(
      (item) => item.ruleKey === "prerequisite",
    ),
    conditions,
    options: [],
  });
  const otherCourses = [
    "PHYS1101",
    "CHEM1101",
    "HIST1001",
    "PHIL1001",
    "STAT1003",
    "MATH1013",
    "MGMT1003",
  ].map((code) => [code, { units: 6, mark: 70 }]);
  for (const [code, expected] of [
    ["COMP1100", "met"],
    ["MATH1005", "partial"],
    ["COMP2100", "partial"],
  ]) {
    assert.equal(
      evaluateRule(rule, {
        completed: new Map([...otherCourses, [code, { units: 6, mark: 70 }]]),
        enrolled: new Set(),
        programmeCodes: [],
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      expected,
    );
  }
});

test("preserves the captured MATH1116 minimum marks on each alternative", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-math1116-requisites.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = emptyCourseExtraction({
    code: "MATH1116",
    year: 2024,
    title: "Advanced Mathematics",
  });
  model.requisites = captured.requisites;
  assert.equal(validateCourseExtraction(model).success, true);
  const projection = projectCourseSnapshot(model);
  assert.deepEqual(
    projection.ruleConditions
      .filter((item) => item.ruleKey === "prerequisite")
      .map(({ requiredCourseCode, minimumMark }) => ({
        requiredCourseCode,
        minimumMark,
      })),
    [
      { requiredCourseCode: "MATH1115", minimumMark: 60 },
      { requiredCourseCode: "MATH1113", minimumMark: 80 },
    ],
  );
  const content = courseCatalogueContent({ projection });
  const rule = requirementSliceExpression({
    rule: content.requirements.rules.find(
      (item) => item.key === "prerequisite",
    ),
    groups: content.requirements.groups.filter(
      (item) => item.ruleKey === "prerequisite",
    ),
    conditions: content.requirements.conditions.filter(
      (item) => item.ruleKey === "prerequisite",
    ),
    options: [],
  });
  for (const [code, mark, expected] of [
    ["MATH1115", 59, "unmet"],
    ["MATH1115", 60, "met"],
    ["MATH1113", 79, "unmet"],
    ["MATH1113", 80, "met"],
  ]) {
    assert.equal(
      evaluateRule(rule, {
        completed: new Map([[code, { units: 6, mark }]]),
        enrolled: new Set(),
        programmeCodes: [],
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      expected,
    );
  }
  for (const minimumMark of [-1, 101, "60"]) {
    model.requisites.prerequisiteRule.rules[0].minimumMark = minimumMark;
    assert.equal(validateCourseExtraction(model).success, false);
  }
});

test("permission projection preserves the stated authority without inventing one", () => {
  const model = emptyCourseExtraction({
    code: "TSTB3060",
    year: 2024,
    title: "Permission test",
  });
  for (const sourceText of [
    "You must have permission from the Research School of Accounting.",
    "Permission of the College of Arts and Social Sciences is required.",
    null,
    undefined,
  ]) {
    model.requisites.prerequisiteRule = {
      op: "permission",
      ...(sourceText === undefined ? {} : { sourceText }),
    };
    assert.equal(validateCourseExtraction(model).success, true);
    const condition = projectCourseSnapshot(model).ruleConditions[0];
    assert.equal(condition.conditionKind, "permission");
    assert.equal(condition.freeText, sourceText ?? "Permission required");
    assert.equal(condition.sourceText, sourceText ?? "Permission required");
  }
  model.requisites.prerequisiteRule = { op: "permission", sourceText: "" };
  assert.equal(validateCourseExtraction(model).success, false);
});

test("assumed knowledge remains advisory and retains its own provenance", () => {
  const model = emptyCourseExtraction({
    code: "STAT2014",
    year: 2024,
    title: "Statistics",
  });
  const text = "Familiarity with matrix algebra is recommended.";
  model.requisites.assumedKnowledgeText = text;
  assert.equal(validateCourseExtraction(model).success, true);
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
    evidence: [
      {
        fieldPath: "requisites.assumedKnowledgeText",
        method: "model",
        confidence: 0.9,
        sourceLabel: "Assumed knowledge",
        sourceText: text,
      },
    ],
  });
  assert.equal(content.requirements.rules.length, 1);
  assert.equal(content.requirements.rules[0].key, "assumed_knowledge");
  assert.equal(content.requirements.rules[0].hardness, "advisory");
  assert.equal(content.requirements.rules[0].confidence, 0.9);
  assert.equal(content.requirements.conditions[0].freeText, text);
  assert.equal(content.requirements.conditions[0].hardness, "advisory");
  const unit = catalogueReviewUnits(content).find(
    (item) => item.fieldPath === "requirements.assumed_knowledge",
  );
  assert.ok(unit);
  assert.equal(reviewUnitEvidence(content, unit.fieldPath)[0].confidence, 0.9);
});

test("captured STAT2014 fee quotes are supported and keep CSP separate from tuition", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-stat2014-fees.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  function feeResult(fees) {
    const model = emptyCourseExtraction({
      code: "STAT2014",
      year: 2024,
      title: "Statistics",
    });
    model.fees = fees;
    return finaliseCourseExtraction({
      code: "STAT2014",
      year: 2024,
      listingTitle: "Statistics",
      model,
      pageMarkdown: captured.sourceMarkdown,
      finishReason: "stop",
      responseError: null,
    });
  }
  assert.equal(feeResult(captured.previousFees).warningCount, 2);
  const result = feeResult(captured.fees);
  assert.equal(result.warningCount, 0);
  assert.equal(result.errorCount, 0);
  const fees = projectCourseSnapshot(result.extraction).fees;
  assert.equal(fees.length, 3);
  assert.deepEqual(
    fees
      .filter((fee) => fee.feeType === "tuition")
      .map((fee) => [fee.audience, fee.amount, fee.studentContributionBand]),
    [
      ["domestic", 4440, null],
      ["international", 6360, null],
    ],
  );
  const contribution = fees.find(
    (fee) => fee.audience === "commonwealth_supported",
  );
  assert.equal(contribution.studentContributionBand, 1);
  assert.equal(contribution.amount, null);
});

test("cross-year offering dates survive validation without changing their year", () => {
  const model = structuredClone(extraction);
  const offering = model.offerings[0];
  offering.startsOn = "2026-11-25";
  offering.endsOn = "2027-02-28";
  offering.lastEnrolmentDate = "2027-01-02";
  offering.censusDate = "2027-01-12";
  assert.equal(validateCourseExtraction(model).success, true);
  const projected = projectCourseSnapshot(model).offeringSessions[0];
  assert.equal(projected.endsOn, "2027-02-28");
  const human = structuredClone(model);
  human.offerings[0].endsOn = "28 Feb 2027";
  const canonical = canonicaliseCourseModelExtraction(human, {
    expectedCode: "COMP2400",
    expectedYear: 2026,
  });
  assert.equal(canonical.value.offerings[0].endsOn, "2027-02-28");
  assert.equal(validateCourseExtraction(canonical.value).success, true);
  for (const endsOn of ["2028-02-28", "2026-01-01", "2025-12-31"]) {
    const invalid = structuredClone(model);
    invalid.offerings[0].endsOn = endsOn;
    assert.equal(validateCourseExtraction(invalid).success, false);
  }
  model.offerings[0].startsOn = "2027-01-01";
  assert.equal(validateCourseExtraction(model).success, false);
});

test("offering labels cannot replace supplied academic period identities", () => {
  const model = structuredClone(extraction);
  const codes = ["S1", "S2", "SUMMER", "AUTUMN", "WINTER", "SPRING"];
  assert.equal(
    validateCourseExtraction(model, { knownPeriodCodes: codes }).success,
    true,
  );
  model.offerings[0].periodCode = "First Semester";
  const validation = validateCourseExtraction(model, {
    knownPeriodCodes: codes,
  });
  assert.equal(validation.success, false);
  assert.ok(
    validation.issues.some(
      (issue) => issue.path === "$.offerings[0].periodCode",
    ),
  );
  const held = finaliseCourseExtraction({
    code: "COMP2400",
    year: 2026,
    listingTitle: extraction.title,
    model,
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
    knownPeriodCodes: codes,
  });
  assert.deepEqual(held.extraction.offerings, []);
  assert.ok(
    held.extraction.reviewItems.some(
      (item) =>
        item.fieldKey.startsWith("offerings") && item.severity === "error",
    ),
  );
  assert.equal(
    validateCourseExtraction(extraction, { knownPeriodCodes: [] }).success,
    false,
  );
});

test("the model receives relevant course identities without resolving ambiguous names in code", () => {
  const prompt = buildCourseExtractionUserPrompt({
    expectedCode: "FINM3010",
    academicYear: 2024,
    pageMarkdown: "Admission requires the Student Managed Fund Course.",
    knownCourses: [
      { code: "FINM3009", name: "Student Managed Fund" },
      { code: "FINM3999", name: "Student Managed Fund" },
      { code: "FINM2002", name: "Corporate Finance" },
    ],
  });
  assert.match(prompt, /FINM3009: Student Managed Fund/u);
  assert.match(prompt, /FINM3999: Student Managed Fund/u);
  assert.equal(prompt.includes("FINM2002"), false);
});

test("a structure link in related courses is rejected without losing the prerequisite tree", () => {
  const model = emptyCourseExtraction({
    code: "TSTC2003",
    year: 2026,
    title: "Test Course",
  });
  const structureLink = {
    position: 1,
    relationKind: "other",
    courseCode: "TSTX-MAJ",
    courseTitle: "Test Studies",
    sourceText: "Test Studies",
  };
  const equivalent = {
    position: 2,
    relationKind: "equivalent",
    courseCode: "TSTC6045",
    courseTitle: null,
    sourceText: "Equivalent course: TSTC6045",
  };
  model.relatedCourses = [structureLink, equivalent];
  model.requisites.prerequisiteText =
    "To enrol in this course you must have previously completed TSTC1001, and either TSTS1008 or TSTS1003.";
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "completed", courseCode: "TSTC1001" },
      {
        op: "one_of",
        rules: [
          { op: "completed", courseCode: "TSTS1008" },
          { op: "completed", courseCode: "TSTS1003" },
        ],
      },
    ],
  };
  const before = structuredClone(model);
  const result = finaliseCourseExtraction({
    code: model.code,
    year: model.year,
    listingTitle: model.title,
    model,
    pageMarkdown:
      "## Majors\n\n- [Test Studies](TSTX-MAJ)\n" + JSON.stringify(model),
    finishReason: "stop",
    responseError: null,
  });
  assert.equal(result.errorCount, 1);
  assert.deepEqual(result.extraction.relatedCourses, [equivalent]);
  assert.deepEqual(
    result.extraction.requisites.prerequisiteRule,
    model.requisites.prerequisiteRule,
  );
  assert.equal(result.report.droppedFields[0].fieldKey, "relatedCourses[0]");
  assert.deepEqual(result.report.droppedFields[0].value, structureLink);
  assert.match(
    result.extraction.reviewItems[0].message,
    /Rejected value:.*TSTX-MAJ.*Test Studies/,
  );
  assert.deepEqual(model, before);
});

test("rejected-value display is bounded while the report retains full content", () => {
  assert.equal(rejectedModelValueSummary(undefined), "");
  assert.equal(rejectedModelValueSummary(null), " Rejected value: null");
  const value = "x".repeat(2000);
  const summary = rejectedModelValueSummary(value);
  assert.equal(summary.endsWith("..."), true);
  assert.ok(summary.length < 530);
  const model = structuredClone(extraction);
  model.relatedCourses = [
    {
      position: 1,
      relationKind: "other",
      courseCode: value,
      courseTitle: null,
      sourceText: "Rejected reference",
    },
  ];
  const result = finaliseCourseExtraction({
    code: model.code,
    year: model.year,
    listingTitle: model.title,
    model,
    pageMarkdown: JSON.stringify(model),
    finishReason: "stop",
    responseError: null,
  });
  assert.equal(result.report.droppedFields[0].value.courseCode, value);
});

test("workload quantities retain their stated basis without inventing totals", () => {
  const model = structuredClone(extraction);
  model.workloadText = "Students are expected to work 10 hours per week.";
  model.workloadHours = 10;
  model.workloadHoursBasis = "weekly";
  assert.equal(validateCourseExtraction(model).success, true);
  const finalise = (value) =>
    finaliseCourseExtraction({
      code: value.code,
      year: value.year,
      listingTitle: value.title,
      model: value,
      pageMarkdown: JSON.stringify(value),
      finishReason: "stop",
      responseError: null,
    });
  const weekly = finalise(model);
  assert.equal(weekly.extraction.workloadHoursBasis, "weekly");
  const snapshot = projectCourseSnapshot(weekly.extraction).snapshot;
  assert.equal(snapshot.workloadHours, 10);
  assert.equal(snapshot.workloadHoursBasis, "weekly");
  model.workloadHoursBasis = "total";
  assert.equal(validateCourseExtraction(model).success, true);
  model.workloadHoursBasis = "daily";
  assert.equal(validateCourseExtraction(model).success, false);
  model.workloadHoursBasis = "weekly";
  model.workloadHours = null;
  assert.equal(validateCourseExtraction(model).success, false);
  const legacy = structuredClone(extraction);
  assert.equal(validateCourseExtraction(legacy).success, true);
  const legacyFinalised = finalise(legacy);
  assert.equal(legacyFinalised.extraction.workloadHoursBasis, null);
  assert.equal(
    legacyFinalised.extraction.reviewItems.some(
      ({ fieldKey }) => fieldKey === "workloadHoursBasis",
    ),
    false,
  );
  assert.equal(
    projectCourseSnapshot(legacy).snapshot.workloadHoursBasis,
    undefined,
  );
});

test("preserves completed subject course counts through finalisation, storage and editor changes", async () => {
  const { treeFromRequirementWrite, requirementWriteWithTree } =
    await import("../lib/catalogue-import/requirement-tree.ts");
  const { validateReviewedTree } =
    await import("../lib/coursemap/requisite-conditions.ts");
  const model = structuredClone(extraction);
  model.requisites.prerequisiteText =
    "You must have completed COMP1100 and a STAT course.";
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "completed", courseCode: "COMP1100", minimumMark: null },
      { op: "min_courses_from_subject", minimumCount: 1, subjectCode: "STAT" },
    ],
  };
  const finalised = finalise(model, { pageMarkdown: JSON.stringify(model) });
  assert.equal(finalised.errorCount, 0);
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(finalised.extraction),
  });
  const condition = content.requirements.conditions.find(
    (row) => row.kind === "subject_courses",
  );
  assert.equal(condition.minimumCount, 1);
  assert.equal(condition.minimumUnits, null);
  assert.equal(condition.maximumUnits, null);
  assert.equal(condition.subjectCode, "STAT");
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const count = tree.children.find((row) => row.kind === "subject_courses");
  assert.equal(count.courseCount, 1);
  count.courseCount = 2;
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated);
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    model.requisites.prerequisiteText,
  );
  const persisted = edited.conditions.find(
    (row) => row.kind === "subject_courses",
  );
  assert.equal(persisted.minimumCount, 2);
  assert.equal(persisted.minimumUnits, null);
  const expression = requirementSliceExpression({
    groups: edited.groups.filter((row) => row.ruleKey === "prerequisite"),
    conditions: edited.conditions.filter(
      (row) => row.ruleKey === "prerequisite",
    ),
    options: edited.options,
  });
  assert.equal(
    expression.conditions.find((row) => row.kind === "subject_courses")
      .minimumCount,
    2,
  );
  assert.equal(
    expression.conditions.find((row) => row.kind === "course").code,
    "COMP1100",
  );
});

test("rejects invalid course counts and zero-unit placeholders before projection", () => {
  for (const minimumCount of [0, -1, 1.5, 32768, null]) {
    const model = structuredClone(extraction);
    model.requisites.prerequisiteRule = {
      op: "min_courses_from_subject",
      minimumCount,
      subjectCode: "STAT",
    };
    assert.equal(validateCourseExtraction(model).success, false);
    assert.ok(finalise(model).errorCount > 0);
  }
  for (const op of [
    "min_units_total",
    "min_units_from_subject",
    "min_units_at_level",
    "min_units_from_courses",
  ]) {
    const model = structuredClone(extraction);
    const rule = { op, minimumUnits: 0 };
    if (op === "min_units_from_subject") rule.subjectCode = "STAT";
    if (op === "min_units_at_level")
      Object.assign(rule, {
        level: 1000,
        maximumLevel: null,
        subjectCode: null,
      });
    if (op === "min_units_from_courses") rule.courseCodes = ["STAT1003"];
    model.requisites.prerequisiteRule = rule;
    assert.equal(validateCourseExtraction(model).success, false);
    assert.ok(finalise(model).errorCount > 0);
  }
});

test("rejects empty and repeated course sets before projection", () => {
  for (const courseCodes of [[], ["STAT1003", "STAT1003"]]) {
    const model = structuredClone(extraction);
    model.requisites.prerequisiteRule = {
      op: "min_units_from_courses",
      minimumUnits: 6,
      courseCodes,
    };

    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(
      validation.issues.some(
        ({ path }) => path === "$.requisites.prerequisiteRule.courseCodes",
      ),
    );
    const result = finalise(model);
    assert.equal(result.extraction.requisites.prerequisiteRule, null);
    assert.ok(result.errorCount > 0);
  }
  const courseSetSchema = COURSE_EXTRACTION_JSON_SCHEMA.$defs.rule.oneOf.find(
    (rule) => rule.properties?.op?.const === "min_units_from_courses",
  );
  assert.equal(courseSetSchema.properties.courseCodes.minItems, 1);
});

test("rejects zero and repeated variable unit options before projection", () => {
  for (const unitsOptions of [
    [0, 6],
    [6, 6],
  ]) {
    const model = structuredClone(extraction);
    model.unitValue = { kind: "variable", unitsOptions };

    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(
      validation.issues.some(({ path }) =>
        path.startsWith("$.unitValue.unitsOptions"),
      ),
    );
    const result = finalise(model);
    assert.deepEqual(result.extraction.unitValue, { kind: "unknown" });
    assert.ok(result.errorCount > 0);
  }
  assert.equal(
    COURSE_EXTRACTION_JSON_SCHEMA.properties.unitValue.oneOf.find(
      (value) => value.properties?.kind?.const === "variable",
    ).properties.unitsOptions.items.exclusiveMinimum,
    0,
  );
});

test("rejects repeated and conflicting exclusion codes before projection", () => {
  for (const [field, codes] of [
    ["incompatibilityCourseCodes", ["MATH1013", "MATH1013"]],
    ["softIncompatibilityCourseCodes", ["MATH1013", "MATH1013"]],
    ["concurrentIncompatibilityCourseCodes", ["MATH1013", "MATH1013"]],
    ["softConcurrentIncompatibilityCourseCodes", ["MATH1013", "MATH1013"]],
  ]) {
    const model = structuredClone(extraction);
    model.requisites[field] = codes;
    const result = validateCourseExtraction(model);
    assert.equal(result.success, false);
    assert.ok(
      result.issues.some(({ path }) => path === `$.requisites.${field}`),
    );
    const finalised = finalise(model);
    assert.ok(finalised.errorCount > 0);
    assert.doesNotThrow(() => projectCourseSnapshot(finalised.extraction));
  }
  for (const [hard, advisory] of [
    ["incompatibilityCourseCodes", "softIncompatibilityCourseCodes"],
    [
      "concurrentIncompatibilityCourseCodes",
      "softConcurrentIncompatibilityCourseCodes",
    ],
  ]) {
    const model = structuredClone(extraction);
    model.requisites[hard] = ["MATH1013"];
    model.requisites[advisory] = ["MATH1013"];
    const result = validateCourseExtraction(model);
    assert.equal(result.success, false);
    assert.ok(
      result.issues.some(({ path }) => path === `$.requisites.${advisory}`),
    );
    const finalised = finalise(model);
    assert.ok(finalised.errorCount > 0);
    assert.doesNotThrow(() => projectCourseSnapshot(finalised.extraction));
  }
  for (const key of [
    "incompatibilityCourseCodes",
    "softIncompatibilityCourseCodes",
    "concurrentIncompatibilityCourseCodes",
    "softConcurrentIncompatibilityCourseCodes",
  ]) {
    assert.equal(
      COURSE_EXTRACTION_JSON_SCHEMA.$defs.requisites.properties[key]
        .uniqueItems,
      true,
    );
  }
});

test("keeps the first row when modelled positions repeat", () => {
  for (const field of [
    "fees",
    "learningOutcomes",
    "assessmentItems",
    "offerings",
    "attributes",
    "relatedCourses",
  ]) {
    const model = structuredClone(extraction);
    const duplicate = structuredClone(model[field][0]);
    model[field].push(duplicate);

    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(
      validation.issues.some(
        ({ path }) =>
          path === `$.${field}[${model[field].length - 1}].position`,
      ),
    );
    const result = finalise(model);
    assert.equal(result.extraction[field].length, model[field].length - 1);
    assert.ok(result.errorCount > 0);
    assert.doesNotThrow(() => projectCourseSnapshot(result.extraction));
  }
});

test("reviews repeated offering identities before projection", () => {
  const model = structuredClone(extraction);
  const duplicate = structuredClone(model.offerings[0]);
  duplicate.position = 2;
  duplicate.periodCode = ` ${duplicate.periodCode} `;
  model.offerings.push(duplicate);

  const validation = validateCourseExtraction(model);
  assert.equal(validation.success, false);
  assert.ok(
    validation.issues.some(({ path }) => path === "$.offerings[1].periodCode"),
  );
  const result = finalise(model);
  assert.equal(result.extraction.offerings.length, 1);
  assert.ok(result.errorCount > 0);
  assert.doesNotThrow(() => projectCourseSnapshot(result.extraction));
});

test("reviews repeated or missing assessment outcome links before projection", () => {
  for (const links of [[1, 1], [99]]) {
    const model = structuredClone(extraction);
    model.assessmentItems[0].learningOutcomePositions = links;

    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(
      validation.issues.some(({ path }) =>
        path.startsWith("$.assessmentItems[0].learningOutcomePositions["),
      ),
    );
    const result = finalise(model);
    assert.equal(result.extraction.assessmentItems.length, 1);
    assert.ok(result.errorCount > 0);
    assert.doesNotThrow(() => projectCourseSnapshot(result.extraction));
  }
});

test("reviews repeated course metadata before projection", () => {
  const variants = [
    {
      field: "areasOfInterest",
      add(model) {
        model.areasOfInterest.push(` ${model.areasOfInterest[0]} `);
      },
      path: "$.areasOfInterest[2]",
    },
    {
      field: "attributes",
      add(model) {
        model.attributes.push({
          ...model.attributes[0],
          position: 4,
          value: ` ${model.attributes[0].value} `,
        });
      },
      path: "$.attributes[3].value",
    },
    {
      field: "relatedCourses",
      add(model) {
        model.relatedCourses.push({
          ...model.relatedCourses[0],
          position: 2,
        });
      },
      path: "$.relatedCourses[1].courseCode",
    },
  ];
  for (const { field, add, path } of variants) {
    const model = structuredClone(extraction);
    add(model);
    const validation = validateCourseExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(validation.issues.some((issue) => issue.path === path));

    const result = finalise(model);
    assert.equal(result.extraction[field].length, extraction[field].length);
    assert.ok(result.errorCount > 0);
    assert.doesNotThrow(() => projectCourseSnapshot(result.extraction));
  }
});

test("concurrent exclusions retain their scope separately from completion bans and prerequisites", async () => {
  const { treeFromRequirementWrite, requirementWriteWithTree } =
    await import("../lib/catalogue-import/requirement-tree.ts");
  const { validateReviewedTree, courseMatch, applyCourseMatch } =
    await import("../lib/coursemap/requisite-conditions.ts");
  const model = structuredClone(extraction);
  const prerequisite = structuredClone(model.requisites.prerequisiteRule);
  model.requisites.incompatibilityText =
    "Cannot concurrently enrol in STAT1003. Previous completion of STAT1008 is incompatible.";
  model.requisites.incompatibilityCourseCodes = ["STAT1008"];
  model.requisites.softIncompatibilityCourseCodes = [];
  model.requisites.concurrentIncompatibilityCourseCodes = ["STAT1003"];
  model.requisites.softConcurrentIncompatibilityCourseCodes = ["STAT2001"];
  const finalised = finalise(model, { pageMarkdown: JSON.stringify(model) });
  assert.equal(finalised.errorCount, 0);
  assert.deepEqual(
    finalised.extraction.requisites.prerequisiteRule,
    prerequisite,
  );
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(finalised.extraction),
  });
  const exclusions = content.requirements.conditions.filter(
    (condition) => condition.ruleKey === "incompatibility",
  );
  assert.deepEqual(
    exclusions.map((condition) => [
      condition.kind,
      condition.itemCode,
      condition.hardness,
    ]),
    [
      ["incompatible", "STAT1008", "hard"],
      ["incompatible_concurrent", "STAT1003", "hard"],
      ["incompatible_concurrent", "STAT2001", "advisory"],
    ],
  );
  const tree = treeFromRequirementWrite(
    content.requirements,
    "incompatibility",
  );
  const concurrent = tree.children.find(
    (condition) => condition.courseCode === "STAT1003",
  );
  assert.equal(courseMatch(concurrent), "not_concurrent");
  assert.equal(
    applyCourseMatch(concurrent, "not_completed").kind,
    "incompatible",
  );
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated);
  const edited = requirementWriteWithTree(
    content.requirements,
    "incompatibility",
    validated.tree,
    model.requisites.incompatibilityText,
  );
  assert.ok(
    edited.conditions.some(
      (condition) =>
        condition.kind === "incompatible_concurrent" &&
        condition.itemCode === "STAT1003" &&
        condition.itemKind === "course",
    ),
  );
  assert.equal(
    edited.conditions.find((condition) => condition.itemCode === "STAT2001")
      .hardness,
    "advisory",
  );
});

test("legacy responses retain their previous completion exclusions", () => {
  const model = structuredClone(extraction);
  delete model.requisites.concurrentIncompatibilityCourseCodes;
  delete model.requisites.softConcurrentIncompatibilityCourseCodes;
  assert.equal(validateCourseExtraction(model).success, true);
  const result = finalise(model);
  assert.equal(result.errorCount, 0);
  assert.equal(
    projectCourseSnapshot(result.extraction).ruleConditions.some(
      (condition) => condition.conditionKind === "incompatible_concurrent",
    ),
    false,
  );
});

test("an ambiguous AND/OR grouping remains a hard unknown with an error flag", () => {
  const prerequisiteText =
    "To enrol in this course you must have completed CHEM1101 and CHEM1102 or CHEM1100.";
  const model = emptyCourseExtraction({
    code: "CHEM2108",
    year: 2026,
    title: "Test Chemistry",
  });
  model.requisites = {
    ...model.requisites,
    prerequisiteText,
    incompatibilityText: "Incompatible with CHEM2008.",
    prerequisiteRule: null,
    incompatibilityCourseCodes: ["CHEM2008"],
    unmodelledText: [prerequisiteText],
  };
  model.reviewItems = [
    {
      fieldKey: "requisites.prerequisiteRule",
      kind: "ambiguous",
      severity: "error",
      message:
        "The prerequisite clause 'CHEM1101 and CHEM1102 or CHEM1100' is ambiguous regarding grouping.",
    },
  ];
  const finalised = finaliseCourseExtraction({
    code: "CHEM2108",
    year: 2026,
    listingTitle: model.title,
    model,
    pageMarkdown: `## Requisite and Incompatibility\n\n${prerequisiteText} Incompatible with CHEM2008.\n`,
    finishReason: "stop",
    responseError: null,
  });
  assert.equal(finalised.errorCount, 2);
  assert.equal(finalised.extraction.requisites.prerequisiteRule, null);
  const projection = projectCourseSnapshot(finalised.extraction);
  const conditions = projection.ruleConditions.filter(
    (item) => item.ruleKey === "prerequisite",
  );
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].conditionKind, "other");
  assert.equal(conditions[0].hardness, "hard");
  assert.equal(conditions[0].freeText, prerequisiteText);
  const content = courseKindAdapter.project(finalised.extraction);
  assert.ok(
    content.flags.some(
      (flag) =>
        flag.severity === "error" &&
        flag.fieldPath === "requisites.prerequisiteRule",
    ),
  );
  const rule = requirementSliceExpression({
    rule: content.requirements.rules.find(
      (item) => item.key === "prerequisite",
    ),
    groups: content.requirements.groups.filter(
      (item) => item.ruleKey === "prerequisite",
    ),
    conditions: content.requirements.conditions.filter(
      (item) => item.ruleKey === "prerequisite",
    ),
    options: [],
  });
  for (const courseCodes of [
    [],
    ["CHEM1100"],
    ["CHEM1101", "CHEM1102"],
    ["CHEM1101", "CHEM1100"],
  ]) {
    assert.equal(
      evaluateRule(rule, {
        completed: new Map(
          courseCodes.map((code) => [code, { units: 6, mark: 100 }]),
        ),
        enrolled: new Set(),
        programmeCodes: [],
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      "unknown",
    );
  }
});

test("an omitted nullable source update field stays invalid until the model explicitly supplies null", () => {
  assert.ok(COURSE_EXTRACTION_JSON_SCHEMA.required.includes("sourceUpdatedAt"));
  const model = structuredClone(extraction);
  delete model.sourceUpdatedAt;
  const omitted = finalise(model);
  assert.ok(
    omitted.extraction.reviewItems.some(
      (item) =>
        item.fieldKey === "sourceUpdatedAt" && item.severity === "error",
    ),
  );
  assert.ok(
    omitted.report.droppedFields.some(
      (item) => item.fieldKey === "sourceUpdatedAt",
    ),
  );
  assert.equal("sourceUpdatedAt" in model, false);
  model.sourceUpdatedAt = null;
  const explicit = finalise(model);
  assert.equal(explicit.extraction.sourceUpdatedAt, null);
  assert.equal(
    explicit.extraction.reviewItems.some(
      (item) => item.fieldKey === "sourceUpdatedAt",
    ),
    false,
  );
});

const conditionalPermissionText =
  "If you have previously completed MATH1013 or MATH1113 then you can only enrol in MATH1115 with the permission of the course convener.";

function permissionExceptionExtraction() {
  const model = emptyCourseExtraction({
    code: "MATH1115",
    year: 2026,
    title: "Advanced Mathematics and Applications 1",
  });
  model.requisites.incompatibilityText = conditionalPermissionText;
  model.requisites.incompatibilityRule = {
    op: "one_of",
    rules: [
      {
        op: "all_of",
        rules: [
          { op: "not_completed", courseCode: "MATH1013" },
          { op: "not_completed", courseCode: "MATH1113" },
        ],
      },
      { op: "permission", sourceText: conditionalPermissionText },
    ],
  };
  return model;
}

test("permission exceptions retain their nested exclusion pathway and review evidence", () => {
  const model = permissionExceptionExtraction();
  assert.equal(validateCourseExtraction(model).success, true);
  const projection = projectCourseSnapshot(model);
  assert.deepEqual(
    projection.ruleGroups.map((group) => group.operator),
    ["any_of", "all_of"],
  );
  assert.deepEqual(
    projection.ruleConditions.map((condition) => condition.conditionKind),
    ["incompatible", "incompatible", "permission"],
  );
  assert.equal(
    projection.ruleConditions[2].sourceText,
    conditionalPermissionText,
  );
  assert.equal(
    projection.ruleConditions[2].freeText,
    conditionalPermissionText,
  );
  assert.deepEqual(
    projection.ruleCourseReferences.map(
      (reference) => reference.referencedCourseCode,
    ),
    ["MATH1013", "MATH1113"],
  );
  const content = courseCatalogueContent({
    projection,
    evidence: [
      {
        fieldPath: "requisites.incompatibilityRule",
        method: "model",
        confidence: 0.95,
        sourceLabel: "Requisite and Incompatibility",
        sourceText: conditionalPermissionText,
      },
    ],
  });
  const unit = catalogueReviewUnits(content).find(
    (item) => item.fieldPath === "requirements.incompatibility",
  );
  assert.ok(unit);
  assert.equal(
    reviewUnitEvidence(content, unit.fieldPath)[0].sourceText,
    conditionalPermissionText,
  );
  const expression = requirementSliceExpression({
    rule: content.requirements.rules[0],
    groups: content.requirements.groups,
    conditions: content.requirements.conditions,
    options: [],
  });
  for (const codes of [
    [],
    ["MATH1013"],
    ["MATH1113"],
    ["MATH1013", "MATH1113"],
  ]) {
    assert.equal(
      evaluateRule(expression, {
        completed: new Map(codes.map((code) => [code, { units: 6, mark: 70 }])),
        enrolled: new Set(),
        programmeCodes: [],
        wam: null,
        gpa: null,
        studyYear: null,
      }).status,
      codes.length ? "unknown" : "met",
    );
  }
  assert.deepEqual(
    unsupportedModelWording(model, conditionalPermissionText),
    [],
  );
});

test("incompatibility trees reject invalid leaves and unconditional duplicates of a waiver", () => {
  const model = permissionExceptionExtraction();
  for (const invalid of [
    { op: "completed", courseCode: "MATH1013" },
    { op: "permission", sourceText: null },
    { op: "permission", sourceText: "" },
    { op: "not_completed", courseCode: "MATH-MAJ" },
    { op: "one_of", rules: [] },
    { op: "all_of", rules: [{ op: "not_completed", courseCode: "MATH1013" }] },
  ]) {
    model.requisites.incompatibilityRule = invalid;
    assert.equal(validateCourseExtraction(model).success, false);
  }
  model.requisites.incompatibilityRule =
    permissionExceptionExtraction().requisites.incompatibilityRule;
  model.requisites.incompatibilityCourseCodes = ["MATH1013"];
  assert.ok(
    validateCourseExtraction(model).issues.some(
      (issue) =>
        issue.path === "$.requisites.incompatibilityCourseCodes" &&
        issue.message.includes("scope"),
    ),
  );
  model.requisites.incompatibilityCourseCodes = [];
  model.requisites.concurrentIncompatibilityCourseCodes = ["MATH1013"];
  assert.equal(validateCourseExtraction(model).success, true);
  model.requisites.prerequisiteRule = {
    op: "not_completed",
    courseCode: "MATH1013",
  };
  assert.equal(validateCourseExtraction(model).success, false);
  model.requisites.prerequisiteRule = null;
  let deep = { op: "not_concurrent", courseCode: "MATH1013" };
  for (let index = 0; index < 18; index++)
    deep = {
      op: "one_of",
      rules: [
        deep,
        { op: "permission", sourceText: conditionalPermissionText },
      ],
    };
  model.requisites.incompatibilityRule = deep;
  assert.ok(
    validateCourseExtraction(model).issues.some((issue) =>
      issue.message.includes("nesting depth"),
    ),
  );
});

test("multiple errors in one exclusion array preserve unrelated requisites", () => {
  const model = structuredClone(extraction);
  const advice = "Contact the first-year coordinator for preparation advice.";
  model.requisites.assumedKnowledgeText = advice;
  model.requisites.incompatibilityRule = {
    op: "one_of",
    rules: [
      { op: "not_completed", courseCode: "MATH1113" },
      { op: "not_completed", courseCode: "MATH1115" },
    ],
  };
  model.requisites.incompatibilityCourseCodes = ["MATH1113", "MATH1115"];

  const result = finaliseCourseExtraction({
    code: model.code,
    year: model.year,
    listingTitle: model.title,
    model,
    pageMarkdown: `${pageMarkdown}\n${advice}`,
    finishReason: "stop",
    responseError: null,
  });

  assert.equal(result.extraction.requisites.assumedKnowledgeText, advice);
  assert.deepEqual(result.extraction.requisites.incompatibilityCourseCodes, []);
  assert.ok(
    result.report.droppedFields.some(
      ({ fieldKey }) => fieldKey === "requisites.incompatibilityCourseCodes",
    ),
  );
  assert.equal(
    result.report.droppedFields.some(
      ({ fieldKey }) => fieldKey === "requisites",
    ),
    false,
  );
  assert.ok(result.errorCount > 0);
});

test("normalises only an equivalent duplicate of a single unconditional exclusion", () => {
  for (const rule of [
    { op: "not_concurrent", courseCode: "LAWS3001" },
    {
      op: "all_of",
      rules: [{ op: "not_concurrent", courseCode: "LAWS3001" }],
    },
  ]) {
    const model = structuredClone(extraction);
    model.requisites.incompatibilityRule = rule;
    model.requisites.concurrentIncompatibilityCourseCodes = ["LAWS3001"];
    assert.equal(validateCourseExtraction(model).success, false);
    const normalised = canonicaliseCourseModelExtraction(model, {
      expectedCode: model.code,
      expectedYear: model.year,
    });
    assert.equal(normalised.value.requisites.incompatibilityRule, null);
    assert.deepEqual(
      normalised.value.requisites.concurrentIncompatibilityCourseCodes,
      ["LAWS3001"],
    );
    assert.equal(validateCourseExtraction(normalised.value).success, true);
    assert.ok(
      normalised.changes.some(
        (change) =>
          change.rule === "redundant_unconditional_exclusion_to_array",
      ),
    );
    assert.match(
      courseModelCanonicalisationReviewItem(normalised.changes)?.message ?? "",
      /duplicated unconditional exclusion/,
    );
  }
  const conditional = permissionExceptionExtraction();
  conditional.requisites.incompatibilityCourseCodes = ["MATH1013"];
  const unchanged = canonicaliseCourseModelExtraction(conditional, {
    expectedCode: conditional.code,
    expectedYear: conditional.year,
  });
  assert.deepEqual(
    unchanged.value.requisites.incompatibilityRule,
    conditional.requisites.incompatibilityRule,
  );
  assert.equal(validateCourseExtraction(unchanged.value).success, false);
});

test("independent unconditional exclusions remain outside the permission exception", () => {
  const model = permissionExceptionExtraction();
  model.requisites.concurrentIncompatibilityCourseCodes = ["MATH1013"];
  model.requisites.incompatibilityCourseCodes = ["MATH1005"];
  const projection = projectCourseSnapshot(model);
  assert.deepEqual(
    projection.ruleGroups.map((group) => group.operator),
    ["all_of", "any_of", "all_of"],
  );
  const independent = projection.ruleConditions.filter(
    (condition) => condition.groupKey === "incompatibility:group:root",
  );
  assert.deepEqual(
    independent.map((condition) => condition.requiredCourseCode),
    ["MATH1005", "MATH1013"],
  );
  const legacy = structuredClone(extraction);
  delete legacy.requisites.incompatibilityRule;
  assert.equal(validateCourseExtraction(legacy).success, true);
});

function cohortWaiverExtraction() {
  const model = emptyCourseExtraction({
    code: "BIOL3101",
    year: 2026,
    title: "Test Biology",
  });
  const permission =
    "Students who have not completed BIOL1001 but commenced their program prior to 2021 can enrol by requesting permission from the Research School of Biology (enquiries.rsb@anu.edu.au)";
  model.requisites.prerequisiteText =
    "To enrol in this course you must have completed BIOL1001 and BIOL2101. Note: " +
    permission;
  model.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "completed", courseCode: "BIOL2101" },
      {
        op: "one_of",
        rules: [
          { op: "completed", courseCode: "BIOL1001" },
          {
            op: "all_of",
            rules: [
              { op: "commencement_year", minimumYear: null, maximumYear: 2020 },
              { op: "permission", sourceText: permission },
            ],
          },
        ],
      },
    ],
  };
  return model;
}

test("a commencement-year waiver preserves the compulsory course and exact permission authority", async () => {
  const { treeFromRequirementWrite, requirementWriteWithTree } =
    await import("../lib/catalogue-import/requirement-tree.ts");
  const { validateReviewedTree } =
    await import("../lib/coursemap/requisite-conditions.ts");
  const model = cohortWaiverExtraction();
  assert.equal(validateCourseExtraction(model).success, true);
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
  });
  const cohort = content.requirements.conditions.find(
    (condition) => condition.kind === "commencement_year",
  );
  assert.equal(cohort.minimumCommencementYear, null);
  assert.equal(cohort.maximumCommencementYear, 2020);
  assert.equal(cohort.minimumYear, null);
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated);
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    model.requisites.prerequisiteText,
  );
  assert.deepEqual(
    edited.conditions.find(
      (condition) => condition.kind === "commencement_year",
    ),
    {
      ...cohort,
      key: edited.conditions.find(
        (condition) => condition.kind === "commencement_year",
      ).key,
      groupKey: edited.conditions.find(
        (condition) => condition.kind === "commencement_year",
      ).groupKey,
      reviewState: "verified",
      confidence: 1,
    },
  );
  const expression = requirementSliceExpression({
    rule: content.requirements.rules[0],
    groups: content.requirements.groups,
    conditions: content.requirements.conditions,
    options: [],
  });
  for (const [codes, commencementYear, permissionApproved, expected] of [
    [["BIOL2101"], 2020, true, "met"],
    [["BIOL2101"], 2020, false, "partial"],
    [["BIOL2101"], 2021, true, "partial"],
    [["BIOL2101"], null, true, "unknown"],
    [["BIOL2101", "BIOL1001"], 2024, false, "met"],
    [[], 2020, true, "partial"],
  ]) {
    assert.equal(
      evaluateRule(expression, {
        completed: new Map(codes.map((code) => [code, { units: 6, mark: 70 }])),
        enrolled: new Set(),
        programmeCodes: [],
        wam: null,
        gpa: null,
        studyYear: 2024,
        commencementYear,
        permissionApproved,
      }).status,
      expected,
    );
  }
});

test("commencement rules require ordered inclusive calendar-year bounds", () => {
  const model = cohortWaiverExtraction();
  for (const [minimumYear, maximumYear, expected] of [
    [null, 2020, true],
    [2021, null, true],
    [2020, 2020, true],
    [null, null, false],
    [2022, 2020, false],
    [10, null, false],
    [1900, 10000, false],
    [2020.5, 2021, false],
    ["2020", null, false],
  ]) {
    model.requisites.prerequisiteRule = {
      op: "commencement_year",
      minimumYear,
      maximumYear,
    };
    assert.equal(validateCourseExtraction(model).success, expected);
  }
});
