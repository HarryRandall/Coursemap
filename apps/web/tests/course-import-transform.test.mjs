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
import { finaliseCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
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
import { catalogueReviewUnits } from "../lib/catalogue/review-units.ts";

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

test("stores an empty, flagged record when the response is not JSON", () => {
  const { extraction: finalised, errorCount } = finalise(null, {
    responseError:
      "OpenRouter returned invalid JSON despite structured-output mode.",
  });
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
  assert.equal(COURSE_IMPORT_PARSER_VERSION, "coursemap-course-parser.v3");
  assert.equal(COURSE_IMPORT_PROMPT_VERSION, "coursemap-course-prompt.v5");
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
    "Expected course: COMP2400\nSelected academic year: 2026\n\n# COMP2400",
  );
});
