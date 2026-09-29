import { unsupportedModelWording } from "../lib/catalogue-import/model-evidence.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  stableFingerprint,
  stableStringify,
} from "../lib/catalogue-import/canonical.ts";
import {
  COURSE_CODE_PATTERN,
  COURSE_EXTRACTION_JSON_SCHEMA,
  validateCourseExtraction,
} from "../lib/catalogue-import/kinds/course/contract.ts";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import {
  canonicaliseCourseModelExtraction,
  courseModelCanonicalisationReviewItem,
} from "../lib/catalogue-import/kinds/course/model-canonical.ts";
import {
  buildCourseExtractionSystemPrompt,
  buildCourseExtractionUserPrompt,
  COURSE_IMPORT_PARSER_VERSION,
  COURSE_IMPORT_PROMPT_VERSION,
} from "../lib/catalogue-import/kinds/course/prompt.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { courseCatalogueContent } from "../lib/catalogue/content.ts";
import {
  catalogueReviewUnits,
  reviewUnitEvidence,
} from "../lib/catalogue/review-units.ts";
import { classifyFirstRead } from "../lib/catalogue/first-read.ts";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression.ts";
import { evaluateRule } from "../lib/coursemap/requisite-evaluation.ts";
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
  assert.equal(result.errorCount, 1);
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
  assert.equal(result.errorCount, 2);
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
      { op: "completed", courseCode: "FINM2001" },
      { op: "completed", courseCode: "FINM2002" },
      {
        op: "one_of",
        rules: [
          { op: "completed", courseCode: "FINM2003" },
          { op: "completed", courseCode: "FINM3011" },
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
    ["FINM2001", "FINM2002", "FINM2003", "FINM3011"],
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

test("advertises exact model formats in the prompt and JSON Schema", () => {
  const prompt = buildCourseExtractionSystemPrompt();
  assert.match(prompt, /YYYY-MM-DD/);
  assert.match(
    prompt,
    /complete HTTPS URL on programsandcourses\.anu\.edu\.au/,
  );
  assert.match(prompt, /tidied, never rewritten/);
  assert.match(prompt, /FINM2001; FINM2002; and, FINM2003 or FINM3011/);
  assert.equal(COURSE_IMPORT_PARSER_VERSION, "coursemap-course-parser.v10");
  assert.equal(COURSE_IMPORT_PROMPT_VERSION, "coursemap-course-prompt.v14");
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
  assert.equal(
    buildCourseExtractionUserPrompt({
      expectedCode: "comp2400",
      academicYear: 2026,
      pageMarkdown: "# COMP2400",
    }),
    "Expected course: COMP2400\nSelected academic year: 2026\nRecognised academic periods for 2026:\nNone configured. Flag every offering session for review.\n\n# COMP2400",
  );
});

test("refuses empty objects and truncated responses even when they parse", () => {
  assert.equal(finalise({}).canPersist, false);
  assert.equal(
    finalise(extraction, { finishReason: "length" }).canPersist,
    false,
  );
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
    "FINM1001",
    "BUSN1001",
    "ECON1101",
    "STAT1003",
    "MATH1013",
    "MGMT1003",
    "MKTG2003",
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
    code: "BUSN3060",
    year: 2024,
    title: "Permission test",
  });
  for (const sourceText of [
    "You must have permission from the Research School of Accounting.",
    "Permission of the College of Business and Economics is required.",
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

test("captured BUSN3060 permission retains its school and is projected once", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-busn3060-requisites.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = emptyCourseExtraction({
    code: "BUSN3060",
    year: 2024,
    title: "Advanced Accounting",
  });
  model.requisites = captured.requisites;
  assert.equal(validateCourseExtraction(model).success, true);
  const conditions = projectCourseSnapshot(model).ruleConditions.filter(
    (item) => item.ruleKey === "prerequisite",
  );
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].conditionKind, "permission");
  assert.equal(
    conditions[0].freeText,
    "You will need to contact the Research School of Accounting to request a permission code to enrol in this course.",
  );
  assert.deepEqual(model.requisites.unmodelledText, []);
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

test("captured STAT2014 preparation advice never becomes a compulsory course", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-stat2014-requisites.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = emptyCourseExtraction({
    code: "STAT2014",
    year: 2024,
    title: "Statistics",
  });
  model.requisites = captured.requisites;
  const projection = projectCourseSnapshot(model);
  const knowledge = projection.ruleConditions.find(
    (item) => item.ruleKey === "assumed_knowledge",
  );
  assert.equal(knowledge.hardness, "advisory");
  assert.equal(knowledge.freeText, captured.requisites.assumedKnowledgeText);
  assert.deepEqual(
    projection.ruleConditions
      .filter((item) => item.ruleKey === "prerequisite")
      .map((item) => item.requiredCourseCode),
    ["STAT1008", "STAT2013"],
  );
  assert.equal(
    projection.ruleCourseReferences.some(
      (item) => item.referencedCourseCode === "MATH1113",
    ),
    false,
  );
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

test("captured CBEA3070 Spring classes retain their following-year end date", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-cbea3070-offerings.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = emptyCourseExtraction({
    code: "CBEA3070",
    year: 2024,
    title: "Business internship",
  });
  model.offerings = captured.offerings;
  assert.equal(
    validateCourseExtraction(model, {
      expectedCode: "CBEA3070",
      expectedYear: 2024,
    }).success,
    true,
  );
  const sessions = projectCourseSnapshot(model).offeringSessions.filter(
    (item) => item.academicPeriodName === "Spring Session",
  );
  assert.equal(sessions.length, 2);
  assert.deepEqual(
    sessions.map((item) => [item.startsOn, item.endsOn]),
    [
      ["2024-10-01", "2025-02-07"],
      ["2024-10-01", "2025-02-07"],
    ],
  );
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

test("captured FINM2002 sessions use calendar codes and preserve ANU labels", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/course-import/anu-2024-finm2002-offerings.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const model = emptyCourseExtraction({
    code: "FINM2002",
    year: 2024,
    title: "Corporate Finance",
  });
  model.offerings = captured.offerings;
  const knownPeriodCodes = captured.knownAcademicPeriods.map(
    (period) => period.code,
  );
  assert.equal(
    validateCourseExtraction(model, { knownPeriodCodes }).success,
    true,
  );
  const projection = projectCourseSnapshot(model);
  assert.deepEqual(
    projection.offeringSessions.map((session) => [
      session.academicPeriodCode,
      session.academicPeriodName,
    ]),
    [
      ["S1", "First Semester"],
      ["S2", "Second Semester"],
    ],
  );
});

for (const [code, stem] of [
  ["FINM2002", "finm2002"],
  ["CBEA3070", "cbea3070"],
]) {
  test(`captured ${code} table quotes retain source rows without rewritten headings`, async () => {
    const captured = JSON.parse(
      await readFile(
        new URL(
          `./fixtures/course-import/anu-2024-${stem}-tables.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.ok(
      unsupportedModelWording(
        {
          fees: captured.previousFees,
          offerings: captured.previousOfferings,
          evidence: captured.previousEvidence,
        },
        captured.sourceMarkdown,
      ).length > 0,
    );
    assert.deepEqual(
      unsupportedModelWording(
        {
          fees: captured.fees,
          offerings: captured.offerings,
          evidence: captured.evidence,
        },
        captured.sourceMarkdown,
      ),
      [],
    );
    const model = emptyCourseExtraction({
      code,
      year: 2024,
      title: "Table quotation test",
    });
    model.fees = captured.fees;
    model.offerings = captured.offerings;
    model.evidence = captured.evidence;
    const result = finaliseCourseExtraction({
      code,
      year: 2024,
      listingTitle: model.title,
      model,
      pageMarkdown: captured.sourceMarkdown,
      finishReason: "stop",
      responseError: null,
      knownPeriodCodes: ["S1", "S2", "SUMMER", "AUTUMN", "WINTER", "SPRING"],
    });
    assert.equal(result.warningCount, 0);
    assert.equal(result.errorCount, 0);
    assert.equal(result.extraction.offerings.length, captured.offerings.length);
    assert.equal(result.extraction.fees.length, captured.fees.length);
  });
}
