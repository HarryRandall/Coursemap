import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  stableFingerprint,
  stableStringify,
} from "../lib/course-import/canonical.ts";
import {
  COURSE_CODE_PATTERN,
  COURSE_EXTRACTION_JSON_SCHEMA,
  validateCourseExtraction,
} from "../lib/course-import/contract.ts";
import { extractDeterministicCourse } from "../lib/course-import/deterministic.ts";
import {
  buildCourseModelInput,
  convertCourseHtmlToMarkdown,
} from "../lib/course-import/markdown.ts";
import {
  checkCourseExtractionEvidence,
  mergeCourseExtractions,
} from "../lib/course-import/merge.ts";
import {
  canonicaliseCourseModelExtraction,
  courseModelCanonicalisationReviewItem,
} from "../lib/course-import/model-canonical.ts";
import {
  buildCourseExtractionSystemPrompt,
  COURSE_IMPORT_PARSER_VERSION,
  COURSE_IMPORT_PROMPT_VERSION,
} from "../lib/course-import/prompt.ts";
import { projectCourseSnapshot } from "../lib/course-import/project-snapshot.ts";

const sourceUrl = "https://programsandcourses.anu.edu.au/2026/course/COMP2400";
const html = await readFile(
  new URL(
    "./fixtures/course-import/anu-2026-comp2400-rich.html",
    import.meta.url,
  ),
  "utf8",
);

const markdown = convertCourseHtmlToMarkdown({
  html,
  courseCode: "COMP2400",
  year: 2026,
  sourceUrl,
});
const selected = buildCourseModelInput(markdown.markdown, 2026);
const deterministic = extractDeterministicCourse({
  html,
  courseCode: "COMP2400",
  year: 2026,
  sourceUrl,
});

test("preserves rich and unknown sections in deterministic Markdown", () => {
  assert.match(markdown.markdown, /## Fees/);
  assert.match(markdown.markdown, /## Learning Outcomes/);
  assert.match(markdown.markdown, /## Indicative Assessment/);
  assert.match(markdown.markdown, /## Workload/);
  assert.match(markdown.markdown, /## Research-led teaching/);
  assert.match(
    markdown.markdown,
    /This previously unknown section must remain inspectable/,
  );
  assert.match(markdown.markdown, /### 2026/);
  assert.match(markdown.markdown, /### 2027/);
  assert.doesNotMatch(markdown.markdown, /Repeated site navigation/);
  assert.ok(
    markdown.statistics.outputCharacters < markdown.statistics.inputCharacters,
  );
});

test("builds a shorter model input containing only selected-year offerings", () => {
  assert.match(selected.modelInput, /### 2026/);
  assert.match(selected.modelInput, /23 Feb 2026/);
  assert.doesNotMatch(selected.modelInput, /### 2027/);
  assert.doesNotMatch(selected.modelInput, /22 Feb 2027/);
  assert.ok(selected.modelInput.length < markdown.markdown.length);
  assert.ok(selected.includedSections.includes("Research-led teaching"));
  assert.equal(
    selected.modelInput.match(/^## Offerings, Dates and Class Summary Links$/gm)
      ?.length,
    1,
  );
  assert.match(
    selected.modelInput,
    /\[View\]\(https:\/\/programsandcourses\.anu\.edu\.au\/course\/COMP2400\/First%20Semester\/1234\)/,
  );
  assert.doesNotMatch(selected.modelInput, /\[View\]\(COMP2400\)/);
});

test("keeps ordinary ANU entity links compact without trusting external class links", () => {
  const linkedHtml = html.replace(
    "successfully completed COMP1100",
    'successfully completed <a href="/2026/course/COMP1100#overview">Introduction to Computing</a>',
  );
  const linked = convertCourseHtmlToMarkdown({
    html: linkedHtml,
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  assert.match(linked.markdown, /\[Introduction to Computing\]\(COMP1100\)/);
  assert.match(
    linked.markdown,
    /https:\/\/programsandcourses\.anu\.edu\.au\/course\/COMP2400\/First%20Semester\/1234/,
  );

  const external = convertCourseHtmlToMarkdown({
    html: html.replace(
      "/course/COMP2400/First%20Semester/1234",
      "https://evil.example/course/COMP2400/First%20Semester/1234",
    ),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  assert.doesNotMatch(external.markdown, /evil\.example/);
  assert.doesNotMatch(external.markdown, /\[View\]\(COMP2400\)/);
});

test("does not duplicate nested secondary headings as top-level sections", () => {
  const nestedHeadingHtml = html
    .replace("<body>", '<body><div class="body__inner">')
    .replace("</body>", "</div></body>")
    .replace(
      '<div id="indicative-fees__domestic">',
      '<div><h2>Course fees</h2><p>Domestic and international</p></div><div id="indicative-fees__domestic">',
    );
  const converted = convertCourseHtmlToMarkdown({
    html: nestedHeadingHtml,
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  const input = buildCourseModelInput(converted.markdown, 2026);
  assert.equal(input.modelInput.match(/^## Course fees$/gm)?.length, 1);
});

test("deterministically extracts every rich course section and excludes future classes", () => {
  assert.equal(deterministic.code, "COMP2400");
  assert.equal(deterministic.title, "Relational Databases");
  assert.deepEqual(deterministic.unitValue, { kind: "fixed", units: 6 });
  assert.equal(deterministic.school, "School of Computing");
  assert.equal(deterministic.college, "ANU College of Systems and Society");
  assert.deepEqual(deterministic.areasOfInterest, [
    "Information Technology",
    "Software Engineering",
  ]);
  assert.equal(deterministic.workloadHours, 130);
  assert.equal(deterministic.fees.length, 3);
  assert.deepEqual(
    deterministic.fees.map(({ audience, amount, studentContributionBand }) => ({
      audience,
      amount,
      studentContributionBand,
    })),
    [
      {
        audience: "commonwealth_supported",
        amount: null,
        studentContributionBand: 2,
      },
      { audience: "domestic", amount: 5520, studentContributionBand: null },
      {
        audience: "international",
        amount: 7020,
        studentContributionBand: null,
      },
    ],
  );
  assert.deepEqual(
    deterministic.learningOutcomes.map(({ text }) => text),
    [
      "Design a normalised relational schema.",
      "Write and evaluate relational queries.",
    ],
  );
  assert.deepEqual(
    deterministic.assessmentItems.map(({ weight }) => weight),
    [40, 60],
  );
  assert.deepEqual(
    deterministic.offerings.map(({ calendarYear, classNumber }) => ({
      calendarYear,
      classNumber,
    })),
    [{ calendarYear: 2026, classNumber: "1234" }],
  );
  assert.equal(
    deterministic.requisites.prerequisiteText.includes("COMP1100"),
    true,
  );
  assert.deepEqual(deterministic.requisites.prerequisiteRule, {
    op: "one_of",
    rules: [
      { op: "completed", courseCode: "COMP1100" },
      { op: "completed", courseCode: "COMP1130" },
    ],
  });
  assert.deepEqual(deterministic.requisites.incompatibilityCourseCodes, [
    "COMP6240",
  ]);
  assert.deepEqual(
    deterministic.attributes.map(({ attributeKind, value }) => ({
      attributeKind,
      value,
    })),
    [
      { attributeKind: "graduate_attribute", value: "Transdisciplinary" },
      { attributeKind: "graduate_attribute", value: "Critical Thinking" },
      { attributeKind: "stem", value: "STEM Course" },
    ],
  );
  assert.equal(
    validateCourseExtraction(deterministic, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
      evidenceMethod: "deterministic",
    }).success,
    true,
  );
});

test("omits an unexpected ANU class link for review without aborting extraction", () => {
  const extraction = extractDeterministicCourse({
    html: html.replace(
      "/course/COMP2400/First%20Semester/1234",
      "/2026/course/COMP2400",
    ),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  assert.equal(extraction.offerings[0].classSummaryUrl, null);
  assert.ok(
    extraction.reviewItems.some(
      ({ fieldKey, kind, message }) =>
        fieldKey === "offerings" &&
        kind === "invalid" &&
        message.includes("class summary link was"),
    ),
  );
  assert.equal(validateCourseExtraction(extraction).success, true);
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

  const extraction = structuredClone(deterministic);
  extraction.code = "COMP8900F";
  extraction.offerings[0].classSummaryUrl =
    "https://programsandcourses.anu.edu.au/course/COMP8900F/First%20Semester/1234";
  extraction.requisites.prerequisiteRule = {
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
  extraction.requisites.incompatibilityCourseCodes = ["TOKP2001X"];
  extraction.relatedCourses = [
    {
      position: 1,
      relationKind: "equivalent",
      courseCode: "COMP8900P",
      courseTitle: "Research Project",
      sourceText: "Equivalent to COMP8900P.",
    },
  ];

  const result = validateCourseExtraction(extraction, {
    expectedCode: "COMP8900F",
    expectedYear: 2026,
    evidenceMethod: "deterministic",
  });
  assert.equal(result.success, true, JSON.stringify(result.issues));
});

test("deterministic requisite extraction preserves single-letter variants", () => {
  const extraction = extractDeterministicCourse({
    html: html
      .replaceAll("COMP1100", "COMP8900F")
      .replaceAll("COMP1130", "COMP8900P")
      .replaceAll("COMP6240", "EXTN1001A"),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });

  assert.match(extraction.requisites.prerequisiteText, /COMP8900F/);
  assert.match(extraction.requisites.prerequisiteText, /COMP8900P/);
  assert.deepEqual(extraction.requisites.incompatibilityCourseCodes, [
    "EXTN1001A",
  ]);
});

test("keeps unpunctuated ANU prerequisite codes out of incompatibilities", () => {
  const unpunctuatedHtml = html.replace(
    "COMP1130. You are not able",
    "COMP1130\n\nYou are not able",
  );
  const extraction = extractDeterministicCourse({
    html: unpunctuatedHtml,
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });

  assert.match(extraction.requisites.prerequisiteText, /COMP1100/);
  assert.match(extraction.requisites.prerequisiteText, /COMP1130/);
  assert.doesNotMatch(
    extraction.requisites.incompatibilityText,
    /COMP1100|COMP1130/,
  );
  assert.deepEqual(extraction.requisites.incompatibilityCourseCodes, [
    "COMP6240",
  ]);
});

test("maps corequisite course wording to completed-or-concurrent rules", () => {
  const extraction = extractDeterministicCourse({
    html: html.replace(
      "COMP1130. You are not able",
      "COMP1130. Co-requisite: COMP2100 or COMP2110. You are not able",
    ),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });

  assert.deepEqual(extraction.requisites.corequisiteRule, {
    op: "one_of",
    rules: [
      { op: "completed_or_concurrent", courseCode: "COMP2100" },
      { op: "completed_or_concurrent", courseCode: "COMP2110" },
    ],
  });
});

test("preserves and flags prerequisite wording that cannot be parsed safely", () => {
  const extraction = extractDeterministicCourse({
    html: html.replace(
      "COMP1100 or\n      COMP1130.",
      "COMP1100 or COMP1130 and MATH1013.",
    ),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });

  assert.equal(extraction.requisites.prerequisiteRule, null);
  assert.match(extraction.requisites.prerequisiteText, /MATH1013/u);
  assert.ok(
    extraction.reviewItems.some(
      ({ fieldKey, kind }) =>
        fieldKey === "requisites.prerequisiteRule" && kind === "ambiguous",
    ),
  );
});

test("does not read the Lo in Log books as a learning-outcome marker", () => {
  const logBookHtml = html.replace(
    "Database design assignment (40%) [LO 1]",
    "Log books indicating activities conducted over the internship. (0) [LO 1, 2]",
  );
  const extraction = extractDeterministicCourse({
    html: logBookHtml,
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  assert.deepEqual(
    extraction.assessmentItems[0].learningOutcomePositions,
    [1, 2],
  );
  assert.equal(
    validateCourseExtraction(extraction, {
      expectedCode: "COMP2400",
      expectedYear: 2026,
      evidenceMethod: "deterministic",
    }).success,
    true,
  );
});

test("drops malformed outcome links for review instead of aborting projection", () => {
  const malformedHtml = html.replace("[LO 1]", "[LO 0, 1, 99]");
  const extraction = extractDeterministicCourse({
    html: malformedHtml,
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl,
  });
  assert.deepEqual(extraction.assessmentItems[0].learningOutcomePositions, [1]);
  assert.ok(
    extraction.reviewItems.some(
      ({ fieldKey, kind }) =>
        fieldKey === "assessmentItems.0.learningOutcomePositions" &&
        kind === "invalid",
    ),
  );
});

test("runtime contract rejects unknown keys and future-year offering rows", () => {
  const withUnknown = structuredClone(deterministic);
  withUnknown.hallucinated = true;
  const unknownResult = validateCourseExtraction(withUnknown);
  assert.equal(unknownResult.success, false);
  assert.ok(unknownResult.issues.some(({ path }) => path === "$.hallucinated"));

  const withFutureOffering = structuredClone(deterministic);
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
  assert.match(prompt, /complete literal HTTPS URL/);
  assert.equal(COURSE_IMPORT_PARSER_VERSION, "coursemap-course-parser.v2");
  assert.equal(COURSE_IMPORT_PROMPT_VERSION, "coursemap-course-prompt.v3");
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
  const raw = structuredClone(deterministic);
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
    evidenceMethod: "model",
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
      evidenceMethod: "model",
    }).success,
    true,
  );

  const reviewItem = courseModelCanonicalisationReviewItem(canonical.changes);
  assert.equal(reviewItem?.severity, "warning");
  assert.match(reviewItem?.message ?? "", /5 provider formatting values/);

  const merged = mergeCourseExtractions({
    deterministic,
    model: canonical.value,
    modelInput: selected.modelInput,
  });
  assert.equal(
    merged.extraction.offerings[0].classSummaryUrl,
    deterministic.offerings[0].classSummaryUrl,
  );
  assert.equal(merged.extraction.offerings[0].startsOn, "2026-02-23");
  const projection = projectCourseSnapshot(merged.extraction);
  assert.equal(projection.offeringSessions[0].startsOn, "2026-02-23");
  assert.equal(
    projection.offeringSessions[0].classSummaryUrl,
    deterministic.offerings[0].classSummaryUrl,
  );
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
    const model = structuredClone(deterministic);
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
      evidenceMethod: "model",
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
    const model = structuredClone(deterministic);
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
      evidenceMethod: "model",
    });
    assert.equal(result.success, false, value);
    assert.ok(
      result.issues.some(
        ({ path }) => path === "$.offerings[0].classSummaryUrl",
      ),
      value,
    );
  }

  const valid = canonicaliseCourseModelExtraction(deterministic, {
    expectedCode: "COMP2400",
    expectedYear: 2026,
  });
  assert.deepEqual(valid.changes, []);
  assert.equal(validateCourseExtraction(valid.value).success, true);
});

test("evidence checking requires source text and support for scalar claims", () => {
  const model = structuredClone(deterministic);
  model.evidence = [
    {
      fieldKey: "college",
      sourceLocator: "Key facts",
      evidenceExcerpt: "ANU College: ANU College of Systems and Society",
      confidence: 0.9,
      method: "model",
    },
    {
      fieldKey: "sourceUpdatedAt",
      sourceLocator: "Key facts",
      evidenceExcerpt: "Relational Databases",
      confidence: 0.5,
      method: "model",
    },
  ];
  model.sourceUpdatedAt = "2026-08-29T00:00:00.000Z";
  const checked = checkCourseExtractionEvidence(model, selected.modelInput);
  assert.deepEqual(checked.matchedFieldKeys, ["college"]);
  assert.ok(
    checked.issues.some(
      ({ fieldKey, message }) =>
        fieldKey === "sourceUpdatedAt" && message.includes("claimed scalar"),
    ),
  );
});

test("merge keeps deterministic conflicts and accepts only evidenced model fills", () => {
  const base = structuredClone(deterministic);
  base.college = null;
  base.evidence = base.evidence.filter(
    ({ fieldKey }) => fieldKey !== "college",
  );

  const model = structuredClone(base);
  model.title = "Relational Databases (model rewrite)";
  model.college = "ANU College of Systems and Society";
  model.sourceUpdatedAt = "2026-08-29T00:00:00.000Z";
  model.evidence = [
    {
      fieldKey: "title",
      sourceLocator: "front matter",
      evidenceExcerpt: "Relational Databases",
      confidence: 0.8,
      method: "model",
    },
    {
      fieldKey: "college",
      sourceLocator: "Key facts",
      evidenceExcerpt: "ANU College: ANU College of Systems and Society",
      confidence: 0.9,
      method: "model",
    },
  ];

  const merged = mergeCourseExtractions({
    deterministic: base,
    model,
    modelInput: selected.modelInput,
  });
  assert.equal(merged.extraction.title, "Relational Databases");
  assert.equal(merged.extraction.college, "ANU College of Systems and Society");
  assert.equal(merged.extraction.sourceUpdatedAt, null);
  assert.ok(merged.conflicts.some(({ fieldKey }) => fieldKey === "title"));
  assert.ok(merged.modelAcceptedFields.includes("college"));
  assert.ok(merged.modelRejectedFields.includes("sourceUpdatedAt"));
  assert.ok(
    merged.extraction.reviewItems.some(
      ({ fieldKey, kind }) =>
        fieldKey === "sourceUpdatedAt" && kind === "evidence_missing",
    ),
  );
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

test("equivalent attributes ignore evidence wording and unordered positions", () => {
  const base = structuredClone(deterministic);
  base.attributes = [
    {
      value: "Critical Thinking",
      position: 1,
      sourceText: "Graduate Attributes: Critical Thinking",
      attributeKind: "graduate_attribute",
    },
    {
      value: "STEM Course",
      position: 2,
      sourceText: "STEM Course",
      attributeKind: "stem",
    },
  ];
  const model = structuredClone(base);
  model.attributes = model.attributes.reverse().map((attribute, index) => ({
    ...attribute,
    position: index + 1,
    sourceText: attribute.value,
  }));
  model.evidence = [];
  const merged = mergeCourseExtractions({
    deterministic: base,
    model,
    modelInput: selected.modelInput,
  });
  assert.equal(
    merged.conflicts.some(({ fieldKey }) => fieldKey === "attributes"),
    false,
  );
  assert.deepEqual(merged.extraction.attributes, base.attributes);
  model.attributes[0].value = "Different attribute";
  const changed = mergeCourseExtractions({
    deterministic: base,
    model,
    modelInput: selected.modelInput,
  });
  assert.ok(
    changed.conflicts.some(({ fieldKey }) => fieldKey === "attributes"),
  );
});

test("assessment value and learning-outcome link changes remain conflicts", () => {
  const model = structuredClone(deterministic);
  model.evidence = [];
  assert.ok(model.assessmentItems.length > 0);
  model.assessmentItems[0].weight = (model.assessmentItems[0].weight ?? 0) + 1;
  const merged = mergeCourseExtractions({
    deterministic,
    model,
    modelInput: selected.modelInput,
  });
  assert.ok(
    merged.conflicts.some(({ fieldKey }) => fieldKey === "assessmentItems"),
  );
  assert.deepEqual(
    merged.extraction.assessmentItems,
    deterministic.assessmentItems,
  );
});

test("assessment outcome link ordering does not create an extraction conflict", () => {
  const model = structuredClone(deterministic);
  model.evidence = [];
  for (const item of model.assessmentItems)
    item.learningOutcomePositions.reverse();
  const merged = mergeCourseExtractions({
    deterministic,
    model,
    modelInput: selected.modelInput,
  });
  assert.equal(
    merged.conflicts.some(({ fieldKey }) => fieldKey === "assessmentItems"),
    false,
  );
});
