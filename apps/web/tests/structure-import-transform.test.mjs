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
import { structureCatalogueContent } from "../lib/catalogue/content.ts";
import { structureKindAdapter } from "../lib/catalogue-import/kinds/structure/adapter.ts";
import { CBE_LIST_ONE_2024_URL } from "../lib/catalogue-import/kinds/structure/cbe-list-one.ts";
import { classifyFirstRead } from "../lib/catalogue/first-read.ts";

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

test("a verified 2024 CBE list is model input with separately attributed evidence", () => {
  const supporting = {
    sourceUrl: CBE_LIST_ONE_2024_URL,
    sourceName: "ANU College of Business and Economics List 1",
    sourceKind: "linked_course_list",
    sourceBaseUrl: "https://cbe.anu.edu.au",
    externalKey: "CBE-LIST-1-2024",
    html: "<h1>List 1: CBE Courses 2024 and 2023</h1>",
    contentSha256: "a".repeat(64),
    byteSize: 44,
    httpStatus: 200,
    httpEtag: null,
    sourceLastModified: null,
    fetchedAt: "2026-09-30T00:00:00Z",
    courseCodes: ["BUSN1001", "ECHI2119"],
    duplicateCodes: ["ECHI2119"],
    mismatchedCourseLinks: [],
  };
  const prompt = buildAcademicStructureExtractionUserPrompt({
    expectedKind: "programme",
    expectedCode: "BFINN",
    academicYear: 2024,
    pageMarkdown: "6 units from completion of courses from List 1.",
    supportingSources: [supporting],
  });
  assert.match(prompt, /Supporting source for linked course-list membership/u);
  assert.match(prompt, /BUSN1001\nECHI2119/u);
  const content = structureKindAdapter.project(extraction, [supporting]);
  assert.ok(
    content.evidence.some(
      (item) =>
        item.sourceUrl === CBE_LIST_ONE_2024_URL &&
        item.method === "deterministic" &&
        item.fieldPath === "requirements.structure",
    ),
  );
  assert.ok(
    content.flags.some(
      (flag) =>
        flag.code === "SOURCE_DUPLICATE_COURSE" &&
        flag.message.includes("ECHI2119"),
    ),
  );
});

test("an incomplete linked list becomes a publication-blocking extraction error", () => {
  const input = {
    claim: { kind: "programme", code: "BFINN", academicYear: 2024 },
    listingTitle: "Bachelor of Finance",
    model: structuredClone(extraction),
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
  };
  const baseline = structureKindAdapter.finalise(input);
  const outcome = structureKindAdapter.finalise({
    ...input,
    supportingSources: [
      {
        courseCodes: ["BUSN1001", "ECHI2119"],
        mismatchedCourseLinks: [],
      },
    ],
  });
  assert.equal(outcome.errorCount, baseline.errorCount + 1);
  assert.ok(
    outcome.extraction.reviewItems.some(
      (item) =>
        item.fieldKey === "requirements.rule" &&
        item.severity === "error" &&
        item.message.includes("full verified 2024 course membership"),
    ),
  );
  const content = structureKindAdapter.project(outcome.extraction);
  assert.ok(
    content.flags.some(
      (flag) =>
        flag.fieldPath === "requirements.rule" && flag.severity === "error",
    ),
  );
});

test("a printed List 1 code that disagrees with its ANU link blocks publication", () => {
  const outcome = structureKindAdapter.finalise({
    claim: { kind: "programme", code: "BFINN", academicYear: 2024 },
    listingTitle: "Bachelor of Finance",
    model: structuredClone(extraction),
    pageMarkdown,
    finishReason: "stop",
    responseError: null,
    supportingSources: [
      {
        courseCodes: ["ECON2900P"],
        mismatchedCourseLinks: [
          { listedCode: "ECON2900P", linkedCode: "ECON2900" },
        ],
      },
    ],
  });
  assert.ok(
    outcome.extraction.reviewItems.some(
      (item) =>
        item.severity === "error" &&
        item.message.includes("prints ECON2900P") &&
        item.message.includes("points to ECON2900"),
    ),
  );
});

test("2024 Finance cannot publish a model response that drops the SMF timing", () => {
  const outcome = structureKindAdapter.finalise({
    claim: { kind: "programme", code: "BFINN", academicYear: 2024 },
    listingTitle: "Bachelor of Finance",
    model: structuredClone(extraction),
    pageMarkdown: `${pageMarkdown}\nFINM3009 Student Managed Fund and FINM3010 Student Managed Fund Extension (12 units*)\nEnrolment in the Student Managed Fund courses requires 12 units over two consecutive semesters.`,
    finishReason: "stop",
    responseError: null,
  });
  assert.ok(
    outcome.extraction.reviewItems.some(
      (item) =>
        item.severity === "error" &&
        item.message.includes("consecutive-semester pair"),
    ),
  );
  assert.ok(
    structureKindAdapter
      .project(outcome.extraction)
      .flags.some(
        (flag) =>
          flag.severity === "error" && flag.fieldPath === "requirements.rule",
      ),
  );
});

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

test("marks a recovered provider response for requirement review", () => {
  const outcome = finalise(structuredClone(extraction), {
    responseRepair: "extra_requirement_closing_brace",
  });
  assert.equal(outcome.errorCount, 0);
  assert.ok(
    outcome.extraction.reviewItems.some(
      (item) =>
        item.kind === "model_repair" &&
        item.fieldKey === "requirements.rule" &&
        item.severity === "warning",
    ),
  );
  const content = structureKindAdapter.project(outcome.extraction);
  const requirement = classifyFirstRead(content).find(
    (item) => item.fieldPath === "requirements.structure",
  );
  assert.equal(requirement?.band, "needs_review");
  assert.match(requirement.reason, /extra closing brace/u);
});

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

test("does not add unresolved wording twice when it is already a free-text condition", () => {
  const model = structuredClone(extraction);
  const distinct =
    "24 units equivalent to 3000-level units from an approved university exchange partner in Asia.";
  model.requirements.unmodelledText.push(distinct);

  const projection = projectAcademicStructureSnapshot(model);
  assert.equal(
    projection.requirementConditions.filter(
      (condition) => condition.conditionKind === "free_text",
    ).length,
    1,
  );
  assert.deepEqual(projection.unmodelledRequirements, [
    {
      position: 1,
      sourceText: distinct,
      sourceLocator: model.requirements.sourceLocator,
    },
  ]);
  const content = structureCatalogueContent({ projection });
  assert.equal(
    content.requirements.conditions.filter(
      (condition) =>
        condition.freeText === model.requirements.unmodelledText[0],
    ).length,
    1,
  );
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.structure",
    )?.band,
    "needs_review",
  );
});

test("keeps a consecutive-semester pair as an ordered, exact-unit condition", () => {
  const model = structuredClone(extraction);
  const timing =
    "*Enrolment in the Student Managed Fund (SMF) courses requires 12 units over two consecutive semesters.";
  const pair = {
    ...model.requirements.rule.children[0],
    key: "smf-pair",
    conditionKind: "consecutive_semester_pair",
    minimumUnits: 12,
    maximumUnits: 12,
    courseCodes: ["FINM3009", "FINM3010"],
    freeText: timing,
    sourceText:
      "FINM3009 Student Managed Fund and FINM3010 Student Managed Fund Extension (12 units*)",
  };
  model.requirements.rule.children.push(pair);
  assert.equal(validateAcademicStructureExtraction(model).success, true);

  const projection = projectAcademicStructureSnapshot(model);
  const content = structureCatalogueContent({ projection });
  const stored = content.requirements.conditions.find(
    (condition) => condition.key === "smf-pair",
  );
  assert.equal(stored.kind, "consecutive_semester_pair");
  assert.equal(stored.minimumUnits, 12);
  assert.equal(stored.maximumUnits, 12);
  assert.equal(stored.freeText, timing);
  assert.deepEqual(
    content.requirements.options
      .filter((option) => option.conditionKey === "smf-pair")
      .map((option) => option.code),
    ["FINM3009", "FINM3010"],
  );

  pair.maximumUnits = 18;
  assert.equal(validateAcademicStructureExtraction(model).success, false);
});

test("preserves a printed exchange unit bound without treating it as measured credit", () => {
  const model = structuredClone(extraction);
  const exchange = {
    ...model.requirements.rule.children[0],
    key: "exchange-route",
    minimumUnits: 24,
    maximumUnits: 24,
    minimumLevel: 3000,
    maximumLevel: 3999,
    sourceText:
      "24 units equivalent to 3000-level units from an approved university exchange partner in Asia. Courses taken while on exchange must be pre-approved by the convenor of the Bachelor of Finance and must focus on financial and capital markets in an Asian context.",
    freeText:
      "24 units equivalent to 3000-level units from an approved university exchange partner in Asia. Courses taken while on exchange must be pre-approved by the convenor of the Bachelor of Finance and must focus on financial and capital markets in an Asian context.",
  };
  model.requirements.rule.children.push(exchange);
  assert.equal(validateAcademicStructureExtraction(model).success, true);

  const content = structureCatalogueContent({
    projection: projectAcademicStructureSnapshot(model),
  });
  const stored = content.requirements.conditions.find(
    (condition) => condition.key === "exchange-route",
  );
  assert.equal(stored.kind, "other");
  assert.equal(stored.minimumUnits, 24);
  assert.equal(stored.maximumUnits, 24);
  assert.equal(stored.minimumLevel, 3000);
  assert.equal(stored.maximumLevel, 3999);
  assert.equal(stored.freeText, exchange.freeText);
  assert.equal(
    classifyFirstRead(content).find(
      (item) => item.fieldPath === "requirements.structure",
    )?.band,
    "needs_review",
  );
});

test("drops only the item that breaks the contract and flags it", () => {
  const model = structuredClone(extraction);
  const badIndex = model.fees.length;
  model.fees.push({
    ...model.fees[0],
    position: badIndex + 1,
    audience: "everyone",
  });
  const { extraction: finalised, errorCount, report } = finalise(model);
  assert.deepEqual(finalised.fees, extraction.fees);
  assert.deepEqual(finalised.relationships, extraction.relationships);
  assert.equal(errorCount, 1);
  assert.deepEqual(report.droppedFields[0].value, model.fees[badIndex]);
  assert.match(
    finalised.reviewItems.find(({ kind }) => kind === "invalid").message,
    /Rejected value:.*everyone/,
  );
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

test("keeps a maximum-unit level cap when the model gives its absent minimum as zero", () => {
  const model = structuredClone(extraction);
  const sourceText =
    "A maximum of 60 units may come from completion of 1000-level courses";
  model.requirements.rule = requirementTree([
    condition("1000-level cap", {
      conditionKind: "level",
      minimumUnits: 0,
      maximumUnits: 60,
      courseCodes: [],
      minimumLevel: 1000,
      maximumLevel: 1999,
      scope: "degree",
      sourceText,
    }),
  ]);
  const result = finalise(model, {
    pageMarkdown: `${pageMarkdown}\n${sourceText}`,
  });
  assert.equal(result.errorCount, 0);
  assert.deepEqual(result.report.repairedRequirements, []);
  assert.ok(
    result.report.providerNormalisations.some((message) =>
      message.includes("minimumUnits was cleared"),
    ),
  );
  const cap = result.extraction.requirements.rule.children[0];
  assert.equal(cap.conditionKind, "level");
  assert.equal(cap.minimumUnits, null);
  assert.equal(cap.maximumUnits, 60);
  assert.equal(cap.scope, "degree");
});

test("accepts a section gathered from several places on the page", () => {
  const model = structuredClone(extraction);
  model.sections[0].sourceText = [
    extraction.sections[1].sourceText,
    extraction.fees[0].sourceText,
  ].join("\n\n");
  assert.equal(finalise(model).warningCount, 0);
});

test("reads a missing unmodelled list as none", () => {
  const model = structuredClone(extraction);
  delete model.requirements.unmodelledText;
  const { extraction: finalised, errorCount } = finalise(model);
  assert.equal(errorCount, 0);
  assert.deepEqual(finalised.requirements.unmodelledText, []);
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

  const unknownSection = structuredClone(extraction);
  unknownSection.sections[0].key = "other_information";
  assert.equal(
    validateAcademicStructureExtraction(unknownSection).success,
    false,
  );

  const repeatedSection = structuredClone(extraction);
  repeatedSection.sections[1].key = repeatedSection.sections[0].key;
  assert.ok(
    validateAcademicStructureExtraction(repeatedSection).issues.some(
      ({ path }) => path === "$.sections.1.key",
    ),
  );

  const programmeOption = structuredClone(extraction);
  programmeOption.relationships[0] = {
    ...programmeOption.relationships[0],
    targetKind: "programme",
    targetCode: "BIT",
  };
  assert.ok(
    validateAcademicStructureExtraction(programmeOption).issues.some(
      ({ path }) => path === "$.relationships.0.targetKind",
    ),
  );

  const retiredKind = structuredClone(extraction);
  retiredKind.relationships[0].relationshipKind = "source_reference";
  assert.equal(validateAcademicStructureExtraction(retiredKind).success, false);
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
    position: 1,
    sectionKey: structured.sections[0].key,
    heading: "Fees and scholarships",
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
    "coursemap-academic-structure-parser.v11",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_IMPORT_PROMPT_VERSION,
    "coursemap-academic-structure-prompt.v19",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
    "academic-structure-extraction.v4",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_SNAPSHOT_SCHEMA_VERSION,
    "academic-structure-snapshot.v3",
  );
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.properties.schemaVersion.const,
    ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  );
  assert.match(systemPrompt, /Never invent/);
  assert.match(systemPrompt, /explicit AND/);
  assert.match(systemPrompt, /free_text/);
  assert.match(systemPrompt, /linked external course list/);
  assert.match(systemPrompt, /specially paired course option/);
  assert.match(systemPrompt, /FINM3009 followed by FINM3010/);
  assert.match(systemPrompt, /Every section object must include sourceLocator/);
  assert.match(systemPrompt, /approved exchange credit/);
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
  assert.deepEqual(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.$defs.section.properties.key.enum,
    [
      "study_options",
      "admission",
      "careers",
      "first_year_advice",
      "advice",
      "inherent_requirements",
      "fees_and_scholarships",
      "further_information",
      "contacts",
    ],
  );
  assert.deepEqual(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.$defs.relationship.properties
      .relationshipKind.enum,
    ["offered_in", "option", "incompatible"],
  );
  assert.match(systemPrompt, /titled "Taken with"/);
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

test("records the majors and minors a programme page lists that the model left out", () => {
  const model = structuredClone(extraction);
  const { extraction: finalised } = finalise(model, {
    pageMarkdown: `${pageMarkdown}\n\n## Minors\n\n- [Human-Centred and Creative Computing](HCCC-MIN)\n- [Not a minor](COMP1100)\n\n## Admission\n\n- [Other](ARTS-MIN)`,
  });
  const added = finalised.relationships.filter(
    ({ targetKind }) => targetKind === "minor",
  );
  assert.deepEqual(
    added.map(
      ({ relationshipKind, targetCode, targetTitle, sourceLocator }) => ({
        relationshipKind,
        targetCode,
        targetTitle,
        sourceLocator,
      }),
    ),
    [
      {
        relationshipKind: "option",
        targetCode: "HCCC-MIN",
        targetTitle: "Human-Centred and Creative Computing",
        sourceLocator: "Minors",
      },
    ],
  );
});

test("failed and truncated structure responses remain audit-only", () => {
  assert.equal(finalise(null).canPersist, false);
  assert.equal(finalise({}).canPersist, false);
  for (const finishReason of ["length", "error", "content_filter"]) {
    assert.equal(finalise(extraction, { finishReason }).canPersist, false);
  }
  assert.equal(finalise(extraction).canPersist, true);
});
