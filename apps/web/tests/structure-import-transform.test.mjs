import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  validateAcademicStructureExtraction,
} from "../lib/catalogue-import/kinds/structure/contract.ts";
import { ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA } from "../lib/catalogue-import/kinds/structure/schema.ts";
import { finaliseAcademicStructureExtraction } from "../lib/catalogue-import/kinds/structure/finalise.ts";
import { listedStructureOptions } from "../lib/catalogue-import/kinds/structure/listed-options.ts";
import { buildAcademicStructureExtractionUserPrompt } from "../lib/catalogue-import/kinds/structure/prompt.ts";
import { projectAcademicStructureSnapshot } from "../lib/catalogue-import/kinds/structure/project.ts";
import { structureCatalogueContent } from "../lib/catalogue/content.ts";
import { structureKindAdapter } from "../lib/catalogue-import/kinds/structure/adapter.ts";
import { convertAnuPageToMarkdown } from "../lib/catalogue-import/anu-page-markdown.ts";
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

test("repairs repeated requirement keys without losing either branch", () => {
  const model = structuredClone(extraction);
  const second = structuredClone(model.requirements.rule.children[0]);
  second.sourceText =
    "12 units from completion of one course from the following list:";
  second.freeText = second.sourceText;
  model.requirements.rule.children.push(second);

  assert.equal(validateAcademicStructureExtraction(model).success, false);
  const result = finalise(model);
  const children = result.extraction.requirements.rule.children;
  assert.equal(children.length, 2);
  assert.notEqual(children[0].key, children[1].key);
  assert.equal(children[1].sourceText, second.sourceText);
  assert.ok(
    result.report.providerNormalisations.some((message) =>
      message.includes("duplicate requirement key"),
    ),
  );
  assert.ok(
    result.extraction.reviewItems.some(
      (item) =>
        item.kind === "model_repair" &&
        item.message.includes("duplicate requirement key"),
    ),
  );
  assert.doesNotThrow(() =>
    projectAcademicStructureSnapshot(result.extraction),
  );
});

test("reviews repeated structure row positions before persistence", () => {
  for (const field of ["summaryFields", "learningOutcomes", "fees"]) {
    const model = structuredClone(extraction);
    model[field].push(structuredClone(model[field][0]));

    const validation = validateAcademicStructureExtraction(model);
    assert.equal(validation.success, false);
    assert.ok(
      validation.issues.some(
        ({ path }) => path === `$.${field}.${model[field].length - 1}.position`,
      ),
    );

    const result = finalise(model);
    assert.equal(result.extraction[field].length, extraction[field].length);
    assert.ok(result.errorCount > 0);
    const projected = projectAcademicStructureSnapshot(result.extraction);
    assert.equal(
      new Set(
        projected[field].map((item) =>
          field === "summaryFields"
            ? `${item.position}:${item.valuePosition}`
            : item.position,
        ),
      ).size,
      projected[field].length,
    );
  }
});

test("keeps typed requirements when the model repeats a list option", () => {
  for (const variant of [
    {
      conditionKind: "course_list",
      field: "courseCodes",
      codes: ["COMP1100", "COMP1100"],
      structureKind: null,
    },
    {
      conditionKind: "structure_list",
      field: "structureCodes",
      codes: ["SOFT-MAJ", "SOFT-MAJ"],
      structureKind: "major",
    },
  ]) {
    const model = structuredClone(extraction);
    const condition = model.requirements.rule.children[0];
    condition.conditionKind = variant.conditionKind;
    condition.minimumUnits = 12;
    condition.freeText = null;
    condition.structureKind = variant.structureKind;
    condition[variant.field] = variant.codes;

    assert.equal(validateAcademicStructureExtraction(model).success, false);
    const result = finalise(model);
    const rule = result.extraction.requirements.rule.children[0];
    assert.equal(rule.conditionKind, variant.conditionKind);
    assert.deepEqual(rule[variant.field], [variant.codes[0]]);
    assert.ok(
      result.extraction.reviewItems.some(
        (item) =>
          item.kind === "model_repair" &&
          item.message.includes("repeated list option"),
      ),
    );
    const options = projectAcademicStructureSnapshot(
      result.extraction,
    ).requirementOptions;
    assert.equal(options.length, 1);
  }
});

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

const PAIR_TIMING =
  "*The practicum courses require 12 units over two consecutive semesters.";

function withSemesterPair(model) {
  const pair = {
    ...model.requirements.rule.children[0],
    key: "practicum-pair",
    conditionKind: "consecutive_semester_pair",
    minimumUnits: 12,
    maximumUnits: 12,
    courseCodes: ["TSTP3001", "TSTP3002"],
    freeText: PAIR_TIMING,
    sourceText:
      "TSTP3001 Practicum and TSTP3002 Practicum Extension (12 units*)",
  };
  model.requirements.rule.children.push(pair);
  return pair;
}

test("keeps a consecutive-semester pair as an ordered, exact-unit condition", () => {
  const model = structuredClone(extraction);
  const pair = withSemesterPair(model);
  assert.equal(validateAcademicStructureExtraction(model).success, true);

  const content = structureCatalogueContent({
    projection: projectAcademicStructureSnapshot(model),
  });
  const stored = content.requirements.conditions.find(
    (condition) => condition.key === "practicum-pair",
  );
  assert.equal(stored.kind, "consecutive_semester_pair");
  assert.equal(stored.minimumUnits, 12);
  assert.equal(stored.freeText, PAIR_TIMING);
  assert.deepEqual(
    content.requirements.options
      .filter((option) => option.conditionKey === "practicum-pair")
      .map((option) => option.code),
    ["TSTP3001", "TSTP3002"],
  );

  pair.maximumUnits = 18;
  assert.equal(validateAcademicStructureExtraction(model).success, false);
});

test("flags consecutive-semester wording that no pair models", () => {
  const model = structuredClone(extraction);
  model.requirements.sourceText += `\n${PAIR_TIMING}`;
  const unmodelled = finalise(model, {
    pageMarkdown: `${pageMarkdown}\n${PAIR_TIMING}`,
  });
  assert.ok(
    unmodelled.extraction.reviewItems.some(
      (item) =>
        item.severity === "error" && item.message.includes("no course pair"),
    ),
  );

  const pair = withSemesterPair(model);
  model.requirements.rule.children.push({
    ...pair,
    key: "ordinary-list",
    conditionKind: "course_list",
    maximumUnits: null,
    courseCodes: ["TSTP3001", "TSTP3100"],
    freeText: null,
  });
  const leaked = finalise(model, {
    pageMarkdown: `${pageMarkdown}\n${PAIR_TIMING}`,
  });
  const messages = leaked.extraction.reviewItems.map((item) => item.message);
  assert.ok(!messages.some((message) => message.includes("no course pair")));
  assert.ok(messages.some((message) => message.includes("could count alone")));
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
      "24 units equivalent to 3000-level units from an approved university exchange partner in Asia. Courses taken while on exchange must be pre-approved by the convenor of the Bachelor of Test Studies and must focus on regional markets in an Asian context.",
    freeText:
      "24 units equivalent to 3000-level units from an approved university exchange partner in Asia. Courses taken while on exchange must be pre-approved by the convenor of the Bachelor of Test Studies and must focus on regional markets in an Asian context.",
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

test("provides a strict recursive JSON schema", () => {
  assert.equal(
    ACADEMIC_STRUCTURE_EXTRACTION_JSON_SCHEMA.properties.schemaVersion.const,
    ACADEMIC_STRUCTURE_EXTRACTION_SCHEMA_VERSION,
  );
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

test("listed structure options ignore codes mentioned only in prose", () => {
  const options = listedStructureOptions(`## Majors

- [Capital Markets](CAPM-MAJ)
- QFIN-MAJ
Students who completed HIST-MAJ may seek advice about credit.
Students should not count [Honours](HONR-MAJ) towards this degree.

## Minors

- [Business Essentials](BESS-MIN)
The course TSTA1001 does not count towards ARCH-MIN.`);
  assert.deepEqual(
    options.map(({ targetCode }) => targetCode),
    ["CAPM-MAJ", "QFIN-MAJ", "BESS-MIN"],
  );
});

test("listed structure options retain ANU's programme option list", async () => {
  const html = await readFile(
    new URL("./fixtures/catalogue/anu-2026-aacom.html", import.meta.url),
    "utf8",
  );
  const markdown = convertAnuPageToMarkdown({ html, frontMatter: {} });
  const options = listedStructureOptions(markdown);
  assert.deepEqual(
    options
      .filter(({ targetKind }) => targetKind === "specialisation")
      .map(({ targetCode }) => targetCode),
    ["ARIN-SPEC", "HCCC-SPEC", "MACL-SPEC", "SYAR-SPEC", "THCS-SPEC"],
  );
});

test("nested guidance does not extend a programme option list", () => {
  const options = listedStructureOptions(`## Majors

- [Capital Markets](CAPM-MAJ)

### Credit advice

- [Prior study](HIST-MAJ) may be assessed separately.

## Minors

- [Business Essentials](BESS-MIN)`);
  assert.deepEqual(
    options.map(({ targetCode }) => targetCode),
    ["CAPM-MAJ", "BESS-MIN"],
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

test("a tag no course carries becomes wording students check themselves", () => {
  const model = structuredClone(extraction);
  model.requirements.rule.children.push({
    ...model.requirements.rule.children[0],
    key: "list-rule",
    conditionKind: "tag",
    tag: "Elective List A",
    minimumUnits: 6,
    freeText: null,
  });
  const listRule = (knownTags) => {
    const result = finalise(model, { knownTags }).extraction;
    return {
      condition: result.requirements.rule.children.find(
        (child) => child.key === "list-rule",
      ),
      flagged: result.reviewItems.some((item) =>
        item.message.includes("Elective List A"),
      ),
    };
  };
  const uncounted = listRule(["Science"]);
  assert.equal(uncounted.condition.conditionKind, "free_text");
  assert.equal(uncounted.condition.tag, null);
  assert.equal(uncounted.condition.freeText, uncounted.condition.sourceText);
  assert.equal(uncounted.condition.minimumUnits, 6);
  assert.equal(uncounted.flagged, true);
  assert.equal(
    validateAcademicStructureExtraction(
      finalise(model, { knownTags: ["Science"] }).extraction,
    ).success,
    true,
  );

  const counted = listRule(["elective list a"]);
  assert.equal(counted.condition.conditionKind, "tag");
  assert.equal(counted.flagged, false);
  assert.equal(listRule(undefined).condition.conditionKind, "tag");

  assert.match(
    buildAcademicStructureExtractionUserPrompt({
      expectedKind: "programme",
      expectedCode: "tstp",
      academicYear: 2026,
      knownTags: ["Elective List A", "Science"],
      pageMarkdown: "# Programme",
    }),
    /Selected academic year: 2026\nKnown tags: Elective List A; Science\n\n# Programme$/u,
  );
});
