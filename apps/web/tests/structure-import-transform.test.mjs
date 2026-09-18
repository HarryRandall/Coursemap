import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA,
  validateAcademicStructureExtraction,
} from "../lib/catalogue-import/kinds/structure/contract.ts";
import { extractDeterministicAcademicStructure } from "../lib/catalogue-import/kinds/structure/deterministic.ts";
import {
  buildAcademicStructureModelInput,
  convertAcademicStructureHtmlToMarkdown,
} from "../lib/catalogue-import/kinds/structure/markdown.ts";
import {
  ACADEMIC_STRUCTURE_IMPORT_PARSER_VERSION,
  ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
  ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  buildAcademicStructureExtractionSystemPrompt,
  buildAcademicStructureExtractionUserPrompt,
} from "../lib/catalogue-import/kinds/structure/prompt.ts";
import { projectAcademicStructureSnapshot } from "../lib/catalogue-import/kinds/structure/project.ts";

const sourceUrl = "https://programsandcourses.anu.edu.au/2026/program/BCOMP";

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <title>Bachelor of Computing</title>
    <meta name="program-code" content="BCOMP">
    <meta name="program-year" content="2026">
    <meta name="program-name" content="Bachelor of Computing">
    <meta name="program-acronym" content="BCMPT">
    <meta name="program-description" content="&lt;p&gt;Fallback description.&lt;/p&gt;">
    <link rel="canonical" href="https://programsandcourses.anu.edu.au/2026/program/bcomp">
  </head>
  <body>
    <nav>Repeated site navigation that must not reach model input.</nav>
    <main>
      <h1>Bachelor of Computing</h1>
      <ul class="degree-summary hide-mobile">
        <li class="degree-summary__requirements-units">
          <span class="degree-summary__requirements-heading">Minimum</span>
          144 Units
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Academic Plan</span>
          <span class="degree-summary__code-text">BCOMP</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Academic Career</span>
          <span class="degree-summary__code-text">Undergraduate</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Mode of Delivery</span>
          <span class="degree-summary__code-text">In Person</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Academic Contact</span>
          <span class="degree-summary__code-text">Course Convenor</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Short Name</span>
          <span class="degree-summary__code-text">Computing</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Duration</span>
          <span class="degree-summary__code-text">3 years</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">College</span>
          <span class="degree-summary__code-text">ANU College of Systems and Society</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Selection Rank</span>
          <span class="degree-summary__code-text">80</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">ATAR</span>
          <span class="degree-summary__code-text">80</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Can Combine</span>
          <span class="degree-summary__code-text">Yes</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Can Combine Vertically</span>
          <span class="degree-summary__code-text">No</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Study As</span>
          <span class="degree-summary__code-text">Full-time or part-time</span>
        </li>
      </ul>
      <div id="introduction"><p>A broad, source-backed computing programme.</p></div>
      <div class="tab-content">
        <h2 id="learning-outcomes">Learning Outcomes</h2>
        <ol>
          <li>Apply computing concepts to practical problems.</li>
          <li>Communicate technical decisions clearly.</li>
        </ol>

        <h2 id="program-requirements">Program Requirements</h2>
        <p>The Bachelor of Computing requires completion of 144 units, of which:</p>
        <p>12 units from completion of one course from the following list:</p>
        <ul>
          <li><a href="/2026/course/COMP1100">COMP1100</a> Programming as Problem Solving</li>
          <li><a href="/2026/course/COMP1130">COMP1130</a> Programming as Problem Solving Advanced</li>
        </ul>
        <p>OR completion of one of the following majors:</p>
        <ul><li><a href="/major/SOFT-MAJ">Software Development</a></li></ul>

        <h2 id="majors">Majors</h2>
        <ul><li><a href="/major/SOFT-MAJ">Software Development</a></li></ul>

        <h2 id="relevant-degrees">Relevant Degrees</h2>
        <ul><li><a href="/program/BIT">Bachelor of Information Technology</a></li></ul>

        <div id="indicative-fees" class="callout-box">
          <div class="callout-box__header"><h2 class="callout-box__title">Indicative fees</h2></div>
          <div class="callout-box__content">
            <div id="indicative-fees__domestic"><p>Commonwealth Supported Place (CSP)</p></div>
            <div id="indicative-fees__international">
              <dl>
                <dt>Annual indicative fee for international students</dt>
                <dd>$56,120.00</dd>
              </dl>
            </div>
          </div>
        </div>
        <h2 id="fee-information">Fee Information</h2>
        <p>The annual indicative fee is based on a full-time load.</p>

        <h2 id="future-ideas">Future Ideas</h2>
        <p>${"This lower-priority marketing paragraph is intentionally long. ".repeat(120)}</p>
      </div>
    </main>
    <footer>Repeated footer.</footer>
  </body>
</html>`;

const nullableFixtureHtml = `<!doctype html>
<html>
  <head>
    <title>Data Science Major</title>
    <meta name="major-code" content="DATA-MAJ">
    <meta name="major-year" content="2026">
    <meta name="major-name" content="Data Science Major">
    <link rel="canonical" href="https://programsandcourses.anu.edu.au/2026/major/DATA-MAJ">
  </head>
  <body>
    <main>
      <h1>Data Science Major</h1>
      <ul class="degree-summary hide-mobile">
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Duration</span>
          <span class="degree-summary__code-text">Flexible according to the study plan</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Can Combine</span>
          <span class="degree-summary__code-text">Sometimes</span>
        </li>
        <li class="degree-summary__code">
          <span class="degree-summary__code-heading">Can Combine Vertically</span>
          <span class="degree-summary__code-text">Subject to approval</span>
        </li>
      </ul>
      <div class="tab-content">
        <h2 id="requirements">Requirements</h2>
        <p>48 units from courses listed for the Data Science major.</p>
      </div>
    </main>
  </body>
</html>`;

const markdown = convertAcademicStructureHtmlToMarkdown({
  html: fixtureHtml,
  kind: "programme",
  code: "BCOMP",
  year: 2026,
  sourceUrl,
});

const deterministic = extractDeterministicAcademicStructure({
  html: fixtureHtml,
  kind: "programme",
  code: "BCOMP",
  year: 2026,
  sourceUrl,
});

test("normalises rich ANU structure HTML into inspectable Markdown", () => {
  assert.match(markdown.markdown, /kind: programme/);
  assert.match(markdown.markdown, /## Summary/);
  assert.match(markdown.markdown, /\*\*Minimum:\*\* 144 Units/);
  assert.match(markdown.markdown, /## Program Requirements/);
  assert.match(markdown.markdown, /\[COMP1100\]\(course:COMP1100\)/);
  assert.match(markdown.markdown, /\[Software Development\]\(major:SOFT-MAJ\)/);
  assert.match(markdown.markdown, /Annual indicative fee/);
  assert.match(markdown.markdown, /\$56,120\.00/);
  assert.doesNotMatch(markdown.markdown, /Repeated site navigation/);
  assert.doesNotMatch(markdown.markdown, /Repeated footer/);
  assert.ok(markdown.statistics.outputCharacters < fixtureHtml.length);
});

test("keeps requirements in bounded model input and reports omitted sections", () => {
  const input = buildAcademicStructureModelInput(markdown, {
    maxCharacters: 4_000,
  });
  assert.match(input.modelInput, /## Program Requirements/);
  assert.match(input.modelInput, /COMP1100/);
  assert.doesNotMatch(input.modelInput, /lower-priority marketing paragraph/);
  assert.ok(input.includedSections.includes("Program Requirements"));
  assert.ok(input.omittedSections.includes("Future Ideas"));
});

test("deterministically extracts metadata, sections, outcomes and relationships", () => {
  assert.equal(deterministic.kind, "programme");
  assert.equal(deterministic.code, "BCOMP");
  assert.equal(deterministic.year, 2026);
  assert.equal(deterministic.title, "Bachelor of Computing");
  assert.equal(deterministic.acronym, "BCMPT");
  assert.equal(deterministic.totalUnits, 144);
  assert.equal(deterministic.academicCareer, "Undergraduate");
  assert.equal(deterministic.deliveryMode, "In Person");
  assert.equal(deterministic.contactText, "Course Convenor");
  assert.equal(deterministic.shortName, "Computing");
  assert.equal(
    deterministic.introduction,
    "A broad, source-backed computing programme.",
  );
  assert.equal(deterministic.description, "Fallback description.");
  assert.equal(deterministic.durationYears, 3);
  assert.equal(deterministic.college, "ANU College of Systems and Society");
  assert.equal(deterministic.selectionRank, 80);
  assert.equal(deterministic.atar, 80);
  assert.equal(deterministic.canCombine, true);
  assert.equal(deterministic.canCombineVertical, false);
  assert.equal(deterministic.studyAs, "Full-time or part-time");
  assert.deepEqual(
    deterministic.learningOutcomes.map(({ text }) => text),
    [
      "Apply computing concepts to practical problems.",
      "Communicate technical decisions clearly.",
    ],
  );
  assert.deepEqual(
    deterministic.fees.map(
      ({ audience, feeType, amount, currency, basis, sourceLocator }) => ({
        audience,
        feeType,
        amount,
        currency,
        basis,
        sourceLocator,
      }),
    ),
    [
      {
        audience: "commonwealth_supported",
        feeType: "student_contribution",
        amount: null,
        currency: null,
        basis: "programme",
        sourceLocator: "#indicative-fees__domestic",
      },
      {
        audience: "international",
        feeType: "indicative",
        amount: 56120,
        currency: null,
        basis: "annual",
        sourceLocator: "#indicative-fees__international",
      },
    ],
  );
  assert.deepEqual(
    deterministic.relationships.map(
      ({ relationshipKind, targetKind, targetCode }) => ({
        relationshipKind,
        targetKind,
        targetCode,
      }),
    ),
    [
      {
        relationshipKind: "source_reference",
        targetKind: "course",
        targetCode: "COMP1100",
      },
      {
        relationshipKind: "source_reference",
        targetKind: "course",
        targetCode: "COMP1130",
      },
      {
        relationshipKind: "source_reference",
        targetKind: "major",
        targetCode: "SOFT-MAJ",
      },
      {
        relationshipKind: "option",
        targetKind: "major",
        targetCode: "SOFT-MAJ",
      },
      {
        relationshipKind: "relevant",
        targetKind: "programme",
        targetCode: "BIT",
      },
    ],
  );
  assert.equal(deterministic.requirements.rule.type, "group");
  assert.equal(
    deterministic.requirements.rule.children[0].conditionKind,
    "free_text",
  );
  assert.deepEqual(deterministic.requirements.unmodelledText, [
    deterministic.requirements.sourceText,
  ]);
  assert.ok(
    deterministic.reviewItems.some(
      ({ fieldKey, kind }) =>
        fieldKey === "requirements.rule" && kind === "unsupported",
    ),
  );
  assert.equal(
    validateAcademicStructureExtraction(deterministic, {
      expectedKind: "programme",
      expectedCode: "BCOMP",
      expectedYear: 2026,
      evidenceMethod: "deterministic",
    }).success,
    true,
  );
});

test("does not store the visible introduction twice when ANU repeats it as metadata", () => {
  const duplicateDescriptionHtml = fixtureHtml.replace(
    "&lt;p&gt;Fallback description.&lt;/p&gt;",
    "&lt;p&gt;A broad, source-backed computing programme.&lt;/p&gt;",
  );
  const duplicateDescription = extractDeterministicAcademicStructure({
    html: duplicateDescriptionHtml,
    kind: "programme",
    code: "BCOMP",
    year: 2026,
    sourceUrl,
  });

  assert.equal(
    duplicateDescription.introduction,
    "A broad, source-backed computing programme.",
  );
  assert.equal(duplicateDescription.description, null);
});

test("keeps absent and ambiguous snapshot metadata nullable", () => {
  const extraction = extractDeterministicAcademicStructure({
    html: nullableFixtureHtml,
    kind: "major",
    code: "DATA-MAJ",
    year: 2026,
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/major/DATA-MAJ",
  });

  assert.deepEqual(
    {
      shortName: extraction.shortName,
      introduction: extraction.introduction,
      durationYears: extraction.durationYears,
      college: extraction.college,
      selectionRank: extraction.selectionRank,
      atar: extraction.atar,
      canCombine: extraction.canCombine,
      canCombineVertical: extraction.canCombineVertical,
      studyAs: extraction.studyAs,
    },
    {
      shortName: null,
      introduction: null,
      durationYears: null,
      college: null,
      selectionRank: null,
      atar: null,
      canCombine: null,
      canCombineVertical: null,
      studyAs: null,
    },
  );
  assert.equal(
    extraction.summaryFields.find(({ key }) => key === "can_combine")
      ?.values[0],
    "Sometimes",
  );
});

test("deterministically extracts every non-programme structure kind", () => {
  for (const target of [
    {
      kind: "major",
      route: "major",
      code: "DATA-MAJ",
      title: "Data Science",
      units: 48,
    },
    {
      kind: "minor",
      route: "minor",
      code: "COMM-MIN",
      title: "Computing",
      units: 24,
    },
    {
      kind: "specialisation",
      route: "specialisation",
      code: "SYAR-SPEC",
      title: "Systems and Architecture",
      units: 24,
    },
    {
      kind: "specialisation",
      route: "specialisation",
      code: "ANTH-HSPC",
      title: "Anthropology Honours",
      units: 48,
    },
  ]) {
    const targetUrl = `https://programsandcourses.anu.edu.au/2026/${target.route}/${target.code}`;
    const html = `<!doctype html>
      <html>
        <head>
          <title>${target.title}</title>
          <meta name="${target.route}-code" content="${target.code}">
          <meta name="${target.route}-year" content="2026">
          <meta name="${target.route}-name" content="${target.title}">
          <link rel="canonical" href="${targetUrl}">
        </head>
        <body>
          <main>
            <h1>${target.title}</h1>
            <ul class="degree-summary hide-mobile">
              <li class="degree-summary__requirements-units">
                <span class="degree-summary__requirements-heading">Minimum</span>
                ${target.units} Units
              </li>
            </ul>
            <div class="tab-content">
              <h2 id="requirements">Requirements</h2>
              <p>Completion of ${target.units} units.</p>
            </div>
          </main>
        </body>
      </html>`;
    const extraction = extractDeterministicAcademicStructure({
      html,
      kind: target.kind,
      code: target.code,
      year: 2026,
      sourceUrl: targetUrl,
    });

    assert.equal(extraction.kind, target.kind);
    assert.equal(extraction.code, target.code);
    assert.equal(extraction.title, target.title);
    assert.equal(extraction.totalUnits, target.units);
    assert.equal(
      validateAcademicStructureExtraction(extraction, {
        expectedKind: target.kind,
        expectedCode: target.code,
        expectedYear: 2026,
        evidenceMethod: "deterministic",
      }).success,
      true,
    );
  }
});

test("strict validation rejects extra keys and selected-target mismatches", () => {
  const extra = { ...structuredClone(deterministic), invented: true };
  assert.equal(validateAcademicStructureExtraction(extra).success, false);

  const wrongCode = structuredClone(deterministic);
  wrongCode.code = "BIT";
  const mismatch = validateAcademicStructureExtraction(wrongCode, {
    expectedKind: "programme",
    expectedCode: "BCOMP",
    expectedYear: 2026,
  });
  assert.equal(mismatch.success, false);
  assert.ok(mismatch.issues.some(({ path }) => path === "$.code"));

  const wrongKind = structuredClone(deterministic);
  wrongKind.kind = "major";
  const kindMismatch = validateAcademicStructureExtraction(wrongKind);
  assert.equal(kindMismatch.success, false);

  const underscoredSection = structuredClone(deterministic);
  underscoredSection.sections[0].key = "other_information";
  assert.equal(
    validateAcademicStructureExtraction(underscoredSection).success,
    true,
  );
  assert.ok(
    kindMismatch.issues.some(
      ({ path, message }) =>
        path === "$.code" && message.includes("major code convention"),
    ),
  );

  for (const code of ["SYAR-SPEC", "ANTH-HSPC"]) {
    const specialisation = structuredClone(deterministic);
    specialisation.kind = "specialisation";
    specialisation.code = code;
    assert.equal(
      validateAcademicStructureExtraction(specialisation).success,
      true,
      `${code} should match the ANU specialisation code convention`,
    );
  }

  const programmeWithSpecialisationCode = structuredClone(deterministic);
  programmeWithSpecialisationCode.kind = "programme";
  programmeWithSpecialisationCode.code = "ANTH-HSPC";
  assert.equal(
    validateAcademicStructureExtraction(programmeWithSpecialisationCode)
      .success,
    false,
  );
});

test("projects an explicit nested requirement tree without flattening its logic", () => {
  const structured = structuredClone(deterministic);
  structured.requirements.rule = {
    type: "group",
    key: "requirements:root",
    operator: "all_of",
    minimumCount: null,
    title: "Program Requirements",
    sourceText: structured.requirements.sourceText,
    sourceLocator: "#program-requirements",
    children: [
      {
        type: "condition",
        key: "requirements:units",
        conditionKind: "unit_total",
        minimumUnits: 144,
        maximumUnits: null,
        minimumCourses: null,
        courseCodes: [],
        structureKind: null,
        structureCodes: [],
        subjectCode: null,
        minimumLevel: null,
        maximumLevel: null,
        tag: null,
        freeText: null,
        sourceText: "requires completion of 144 units",
        sourceLocator: "#program-requirements",
      },
      {
        type: "group",
        key: "requirements:course-choice",
        operator: "any_of",
        minimumCount: null,
        title: "One course",
        sourceText: "one course from the following list",
        sourceLocator: "#program-requirements",
        children: [
          {
            type: "condition",
            key: "requirements:comp1100",
            conditionKind: "course_list",
            minimumUnits: null,
            maximumUnits: null,
            minimumCourses: 1,
            courseCodes: ["COMP1100"],
            structureKind: null,
            structureCodes: [],
            subjectCode: null,
            minimumLevel: null,
            maximumLevel: null,
            tag: null,
            freeText: null,
            sourceText: "COMP1100",
            sourceLocator: "#program-requirements",
          },
          {
            type: "condition",
            key: "requirements:comp1130",
            conditionKind: "course_list",
            minimumUnits: null,
            maximumUnits: null,
            minimumCourses: 1,
            courseCodes: ["COMP1130"],
            structureKind: null,
            structureCodes: [],
            subjectCode: null,
            minimumLevel: null,
            maximumLevel: null,
            tag: null,
            freeText: null,
            sourceText: "COMP1130",
            sourceLocator: "#program-requirements",
          },
        ],
      },
    ],
  };
  structured.requirements.unmodelledText = [];

  const projection = projectAcademicStructureSnapshot(structured);
  assert.deepEqual(
    {
      shortName: projection.snapshot.shortName,
      introduction: projection.snapshot.introduction,
      durationYears: projection.snapshot.durationYears,
      college: projection.snapshot.college,
      selectionRank: projection.snapshot.selectionRank,
      atar: projection.snapshot.atar,
      canCombine: projection.snapshot.canCombine,
      canCombineVertical: projection.snapshot.canCombineVertical,
      studyAs: projection.snapshot.studyAs,
    },
    {
      shortName: "Computing",
      introduction: "A broad, source-backed computing programme.",
      durationYears: 3,
      college: "ANU College of Systems and Society",
      selectionRank: 80,
      atar: 80,
      canCombine: true,
      canCombineVertical: false,
      studyAs: "Full-time or part-time",
    },
  );
  assert.equal(projection.requirementRootKey, "requirements:root");
  assert.deepEqual(
    projection.requirementGroups.map(
      ({ key, parentGroupKey, operator, position }) => ({
        key,
        parentGroupKey,
        operator,
        position,
      }),
    ),
    [
      {
        key: "requirements:root",
        parentGroupKey: null,
        operator: "all_of",
        position: 1,
      },
      {
        key: "requirements:course-choice",
        parentGroupKey: "requirements:root",
        operator: "any_of",
        position: 2,
      },
    ],
  );
  assert.deepEqual(
    projection.requirementConditions.map(
      ({ key, groupKey, position, minimumUnits }) => ({
        key,
        groupKey,
        position,
        minimumUnits,
      }),
    ),
    [
      {
        key: "requirements:units",
        groupKey: "requirements:root",
        position: 1,
        minimumUnits: 144,
      },
      {
        key: "requirements:comp1100",
        groupKey: "requirements:course-choice",
        position: 1,
        minimumUnits: null,
      },
      {
        key: "requirements:comp1130",
        groupKey: "requirements:course-choice",
        position: 2,
        minimumUnits: null,
      },
    ],
  );
  assert.deepEqual(
    projection.requirementOptions.map(
      ({ conditionKey, position, optionKind, optionCode }) => ({
        conditionKey,
        position,
        optionKind,
        optionCode,
      }),
    ),
    [
      {
        conditionKey: "requirements:comp1100",
        position: 1,
        optionKind: "course",
        optionCode: "COMP1100",
      },
      {
        conditionKey: "requirements:comp1130",
        position: 1,
        optionKind: "course",
        optionCode: "COMP1130",
      },
    ],
  );
  assert.deepEqual(projection.sections[0], {
    position: structured.sections[0].position,
    sectionKey: structured.sections[0].key,
    heading: structured.sections[0].heading,
    markdown: structured.sections[0].markdown,
    sourceText: structured.sections[0].sourceText,
    sourceLocator: structured.sections[0].sourceLocator,
  });
  assert.deepEqual(projection.learningOutcomes[0], {
    position: structured.learningOutcomes[0].position,
    outcomeText: structured.learningOutcomes[0].text,
    sourceText: structured.learningOutcomes[0].sourceText,
    sourceLocator: structured.learningOutcomes[0].sourceLocator,
  });
  assert.deepEqual(projection.fees, structured.fees);
  assert.deepEqual(projection.relationships, structured.relationships);
  assert.match(projection.projectionSha256, /^[0-9a-f]{64}$/);
});

test("provides a strict OpenRouter prompt and recursive JSON schema", () => {
  const systemPrompt = buildAcademicStructureExtractionSystemPrompt();
  assert.equal(
    ACADEMIC_STRUCTURE_IMPORT_PARSER_VERSION,
    "coursemap-academic-structure-parser.v4",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
    "coursemap-academic-structure-prompt.v4",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
    "academic-structure-extraction.v3",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
    "academic-structure-snapshot.v2",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.properties.schemaVersion.const,
    ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  );
  assert.match(systemPrompt, /Never invent/);
  assert.match(systemPrompt, /explicit AND/);
  assert.match(systemPrompt, /free_text/);
  assert.match(systemPrompt, /Set freeText to null/);
  assert.match(systemPrompt, /canCombineVertical/);
  assert.match(systemPrompt, /literally states yes, no, true or false/);
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.additionalProperties,
    false,
  );
  assert.deepEqual(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.$defs.requirementRule.oneOf,
    [
      { $ref: "#/$defs/requirementGroup" },
      { $ref: "#/$defs/requirementCondition" },
    ],
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.properties.fees.items.$ref,
    "#/$defs/fee",
  );
  assert.deepEqual(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.required.filter((field) =>
      [
        "shortName",
        "introduction",
        "durationYears",
        "college",
        "selectionRank",
        "atar",
        "canCombine",
        "canCombineVertical",
        "studyAs",
      ].includes(field),
    ),
    [
      "shortName",
      "introduction",
      "durationYears",
      "college",
      "selectionRank",
      "atar",
      "canCombine",
      "canCombineVertical",
      "studyAs",
    ],
  );
  assert.deepEqual(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.properties.canCombineVertical
      .type,
    ["boolean", "null"],
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.$defs.evidence.properties.method
      .const,
    "model",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.$defs.section.properties.key
      .pattern,
    "^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
  );
  assert.match(systemPrompt, /Set method to model/);
  assert.match(
    buildAcademicStructureExtractionUserPrompt({
      expectedKind: "programme",
      expectedCode: "BCOMP",
      academicYear: 2026,
      modelInput: "source data",
    }),
    /Expected structure kind: programme[\s\S]*BCOMP[\s\S]*2026[\s\S]*source data/,
  );
});
