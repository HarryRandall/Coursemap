import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA,
  validateAcademicStructureExtraction,
} from "../lib/catalogue-import/kinds/structure/contract.ts";
import { finaliseAcademicStructureExtraction } from "../lib/catalogue-import/kinds/structure/finalise.ts";
import {
  ACADEMIC_STRUCTURE_IMPORT_PARSER_VERSION,
  ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
  ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
  buildAcademicStructureExtractionSystemPrompt,
  buildAcademicStructureExtractionUserPrompt,
} from "../lib/catalogue-import/kinds/structure/prompt.ts";
import { projectAcademicStructureSnapshot } from "../lib/catalogue-import/kinds/structure/project.ts";

// A complete, valid extraction of the reduced Bachelor of Computing page, in
// the shape the model returns.
const extraction = JSON.parse(
  await readFile(
    new URL("./fixtures/catalogue/bcomp-2026-extraction.json", import.meta.url),
    "utf8",
  ),
);
const pageMarkdown = [
  "# Bachelor of Computing",
  extraction.introduction,
  ...extraction.summaryFields.map(({ sourceText }) => sourceText),
  ...extraction.sections.map(({ sourceText }) => sourceText),
  ...extraction.learningOutcomes.map(({ sourceText }) => sourceText),
  ...extraction.fees.map(({ sourceText }) => sourceText),
  ...extraction.relationships.map(({ sourceText }) => sourceText),
  extraction.requirements.sourceText,
  ...extraction.evidence.map(({ evidenceExcerpt }) => evidenceExcerpt),
].join("\n\n");

function finalise(model, overrides = {}) {
  return finaliseAcademicStructureExtraction({
    kind: "programme",
    code: "BCOMP",
    year: 2026,
    listingTitle: "Bachelor of Computing",
    model,
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
    ...overrides,
  });
}

test("keeps every field the model returns, including sections and outcomes", () => {
  const model = structuredClone(extraction);
  model.title = "Bachelor of Computing (tidied)";
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  assert.equal(finalised.title, "Bachelor of Computing (tidied)");
  assert.deepEqual(finalised.sections, extraction.sections);
  assert.deepEqual(finalised.learningOutcomes, extraction.learningOutcomes);
  assert.deepEqual(finalised.summaryFields, extraction.summaryFields);
});

test("drops only the item that breaks the contract and flags it", () => {
  const model = structuredClone(extraction);
  const badIndex = model.fees.length;
  model.fees.push({
    ...model.fees[0],
    position: badIndex + 1,
    audience: "everyone",
  });
  const { extraction: finalised, errorCount } = finalise(model);
  assert.deepEqual(finalised.fees, extraction.fees);
  assert.deepEqual(finalised.relationships, extraction.relationships);
  assert.equal(errorCount, 1);
  assert.ok(
    finalised.reviewItems.some(
      ({ fieldKey, severity }) =>
        fieldKey === `fees[${badIndex}]` && severity === "error",
    ),
  );
});

test("never takes identity from the model", () => {
  const model = structuredClone(extraction);
  model.code = "BIT";
  model.kind = "major";
  model.year = 2027;
  const { extraction: finalised } = finalise(model);
  assert.equal(finalised.code, "BCOMP");
  assert.equal(finalised.kind, "programme");
  assert.equal(finalised.year, 2026);
});

test("stores an empty, flagged record when the response is unusable", () => {
  const { extraction: finalised, errorCount } = finalise(null, {
    finishReason: "length",
  });
  assert.equal(finalised.title, "Bachelor of Computing");
  assert.equal(finalised.requirements.rule, null);
  assert.equal(errorCount, 2);
  assert.ok(
    finalised.reviewItems.some(({ message }) =>
      message.includes("output limit"),
    ),
  );
});

test("warns about wording the page does not contain without dropping it", () => {
  const model = structuredClone(extraction);
  model.learningOutcomes[0].sourceText =
    "Invented wording the page never used.";
  const { extraction: finalised, warningCount, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  assert.equal(warningCount, 1);
  assert.equal(
    finalised.learningOutcomes[0].sourceText,
    "Invented wording the page never used.",
  );
});

function condition(key, overrides = {}) {
  return {
    type: "condition",
    key,
    conditionKind: "course_list",
    minimumUnits: 6,
    maximumUnits: null,
    minimumCourses: null,
    courseCodes: ["COMP1100"],
    structureKind: null,
    structureCodes: [],
    subjectCode: null,
    minimumLevel: null,
    maximumLevel: null,
    tag: null,
    freeText: null,
    sourceText: extraction.requirements.sourceText,
    sourceLocator: "#program-requirements",
    ...overrides,
  };
}

function requirementTree(children) {
  return {
    type: "group",
    key: "requirements:root",
    operator: "all_of",
    minimumCount: null,
    title: null,
    sourceText: extraction.requirements.sourceText,
    sourceLocator: "#program-requirements",
    children,
  };
}

test("clears a minimum count the operator does not use", () => {
  const model = structuredClone(extraction);
  model.requirements.rule = requirementTree([
    {
      ...requirementTree([condition("a"), condition("b")]),
      key: "requirements:choice",
      operator: "any_of",
      minimumCount: 1,
    },
  ]);
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  assert.equal(finalised.requirements.rule.children[0].minimumCount, null);
  assert.equal(finalised.requirements.rule.children[0].children.length, 2);
});

test("keeps a malformed requirement branch as its wording, not the whole tree", () => {
  const model = structuredClone(extraction);
  model.requirements.rule = requirementTree([
    condition("kept"),
    condition("broken", {
      minimumUnits: -6,
      sourceText: "12 units from a list the model misread",
    }),
  ]);
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  const [kept, broken] = finalised.requirements.rule.children;
  assert.equal(kept.conditionKind, "course_list");
  assert.equal(broken.conditionKind, "free_text");
  assert.equal(broken.freeText, "12 units from a list the model misread");
  assert.ok(
    finalised.reviewItems.some(
      ({ fieldKey, kind }) =>
        fieldKey === "requirements.rule.children.1" && kind === "ambiguous",
    ),
  );
});

test("does not store the introduction twice when the model repeats it", () => {
  const model = structuredClone(extraction);
  model.description = model.introduction;
  assert.equal(finalise(model).extraction.description, null);
});

test("strict validation rejects extra keys and selected-target mismatches", () => {
  const extra = { ...structuredClone(extraction), invented: true };
  assert.equal(validateAcademicStructureExtraction(extra).success, false);

  const wrongCode = structuredClone(extraction);
  wrongCode.code = "BIT";
  const mismatch = validateAcademicStructureExtraction(wrongCode, {
    expectedKind: "programme",
    expectedCode: "BCOMP",
    expectedYear: 2026,
  });
  assert.equal(mismatch.success, false);
  assert.ok(mismatch.issues.some(({ path }) => path === "$.code"));

  const wrongKind = structuredClone(extraction);
  wrongKind.kind = "major";
  const kindMismatch = validateAcademicStructureExtraction(wrongKind);
  assert.equal(kindMismatch.success, false);

  const underscoredSection = structuredClone(extraction);
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
    const specialisation = structuredClone(extraction);
    specialisation.kind = "specialisation";
    specialisation.code = code;
    assert.equal(
      validateAcademicStructureExtraction(specialisation).success,
      true,
      `${code} should match the ANU specialisation code convention`,
    );
  }

  const programmeWithSpecialisationCode = structuredClone(extraction);
  programmeWithSpecialisationCode.kind = "programme";
  programmeWithSpecialisationCode.code = "ANTH-HSPC";
  assert.equal(
    validateAcademicStructureExtraction(programmeWithSpecialisationCode)
      .success,
    false,
  );
});

test("projects an explicit nested requirement tree without flattening its logic", () => {
  const structured = structuredClone(extraction);
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
    "coursemap-academic-structure-parser.v5",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
    "coursemap-academic-structure-prompt.v6",
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
  assert.match(systemPrompt, /tidied, never rewritten/);
  assert.match(systemPrompt, /Back to the top/);
  assert.match(
    buildAcademicStructureExtractionUserPrompt({
      expectedKind: "programme",
      expectedCode: "BCOMP",
      academicYear: 2026,
      pageMarkdown: "source data",
    }),
    /Expected structure kind: programme[\s\S]*BCOMP[\s\S]*2026[\s\S]*source data/,
  );
});
