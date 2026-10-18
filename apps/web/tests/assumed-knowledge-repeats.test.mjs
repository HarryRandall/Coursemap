import assert from "node:assert/strict";
import { test } from "vitest";
import {
  isPlaceholderText,
  withoutAssumedKnowledgeRepeats,
} from "../lib/catalogue-import/kinds/course/assumed-knowledge.ts";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";

// Wording from 2026 ANU pages whose agent answers repeated assumed knowledge
// inside the prerequisite rule.
const PHIL4011_ASSUMED =
  "Demonstrated level of knowledge and skills required to participate effectively in the reading group.";
const PHIL4011_PERMISSION =
  "You will need to contact the School of Philosophy to request a permission code to enrol in this course.";
const ASIA3084_FAVOURABLE =
  "No prior knowledge of Mongolia or Mongolian language is required, but looked upon favourably in the selection process.";
const ASIA3084_ENCOURAGED =
  "Students planning to take this course are encouraged to take Mongolian language (e.g., MNGL1002) and/or culture courses (e.g., ASIA2016).";
const MUSI1101_AUDITION = "Please note that entry to MUSI1101 is by audition.";
const MUSI1101_ASSUMED = `${MUSI1101_AUDITION} Applicants undertaking an audition will be expected to have pre-existing musical knowledge obtained through secondary studies, or equivalent qualifications or experience.`;
const GENUINE_NOTE =
  "Enrolment is subject to a suitable placement being available.";

function course({ assumed, text, rule = null, unmodelled = [] }) {
  const model = emptyCourseExtraction({
    code: "TEST2001",
    year: 2026,
    title: "Test course",
  });
  model.requisites.assumedKnowledgeText = assumed;
  model.requisites.prerequisiteText = text;
  model.requisites.prerequisiteRule = rule;
  model.requisites.unmodelledText = unmodelled;
  return model;
}

function conditions(model, ruleKind) {
  return projectCourseSnapshot(model).ruleConditions.filter(
    (condition) => condition.ruleKey === ruleKind,
  );
}

function ruleOf(model, ruleKind) {
  return projectCourseSnapshot(model).rules.find(
    (rule) => rule.ruleKind === ruleKind,
  );
}

test("a prerequisite note repeating assumed knowledge is removed", () => {
  const model = course({
    assumed: PHIL4011_ASSUMED,
    text: `To enrol you must hold admission to Honours. ${PHIL4011_PERMISSION}\n\n${PHIL4011_ASSUMED}`,
    rule: {
      op: "all_of",
      rules: [
        { op: "permission", sourceText: PHIL4011_PERMISSION },
        { op: "note", sourceText: PHIL4011_ASSUMED, required: true },
      ],
    },
  });

  const prerequisite = conditions(model, "prerequisite");
  assert.deepEqual(
    prerequisite.map(({ conditionKind }) => conditionKind),
    ["permission"],
  );
  // The source wording keeps the requisite section but not the repeat.
  assert.equal(
    ruleOf(model, "prerequisite").sourceText.includes("reading group"),
    false,
  );
  assert.deepEqual(
    conditions(model, "assumed_knowledge").map(({ freeText }) => freeText),
    [PHIL4011_ASSUMED],
  );
});

test("a hard text condition taken from assumed knowledge is removed", () => {
  const model = course({
    assumed: MUSI1101_ASSUMED,
    text: `To enrol you must be enrolled in the Bachelor of Music (BMUSI).\n\n${MUSI1101_AUDITION}`,
    rule: {
      op: "all_of",
      rules: [
        { op: "enrolled_in", programmeCode: "BMUSI" },
        { op: "external_requirement", sourceText: MUSI1101_AUDITION },
      ],
    },
  });

  const prerequisite = conditions(model, "prerequisite");
  assert.deepEqual(
    prerequisite.map(({ conditionKind, hardness }) => [
      conditionKind,
      hardness,
    ]),
    [["admission", "hard"]],
  );
});

test("an advisory course group built from assumed knowledge is removed", () => {
  const model = course({
    assumed: `${ASIA3084_FAVOURABLE} ${ASIA3084_ENCOURAGED}`,
    text: `To enrol in this course you must have successfully completed at least 24 units of university courses.\n\n${ASIA3084_FAVOURABLE}`,
    rule: {
      op: "all_of",
      rules: [
        { op: "min_units_total", minimumUnits: 24 },
        { op: "note", sourceText: ASIA3084_FAVOURABLE, recommended: true },
        {
          op: "soft",
          sourceText: ASIA3084_ENCOURAGED,
          rule: {
            op: "one_of",
            rules: [
              { op: "completed", courseCode: "MNGL1002" },
              { op: "completed", courseCode: "ASIA2016" },
            ],
          },
        },
      ],
    },
  });

  const prerequisite = conditions(model, "prerequisite");
  assert.deepEqual(
    prerequisite.map(({ conditionKind }) => conditionKind),
    ["units_total"],
  );
  assert.equal(
    projectCourseSnapshot(model).ruleCourseReferences.length,
    0,
    "advisory assumed knowledge courses are no longer prerequisite references",
  );
});

test("hard course conditions are kept even when assumed knowledge names them", () => {
  const assumed = "Students should have completed ASIA2016 before enrolling.";
  const model = course({
    assumed,
    text: "To enrol you must have completed ASIA2016.",
    rule: { op: "completed", courseCode: "ASIA2016" },
  });

  assert.deepEqual(
    conditions(model, "prerequisite").map(({ conditionKind, hardness }) => [
      conditionKind,
      hardness,
    ]),
    [["course", "hard"]],
  );
});

test("a genuine prerequisite note is kept", () => {
  const model = course({
    assumed: PHIL4011_ASSUMED,
    text: `To enrol you must have completed 48 units. ${GENUINE_NOTE}`,
    rule: {
      op: "all_of",
      rules: [
        { op: "min_units_total", minimumUnits: 48 },
        { op: "note", sourceText: GENUINE_NOTE },
      ],
    },
  });

  assert.deepEqual(
    conditions(model, "prerequisite").map(({ conditionKind, freeText }) => [
      conditionKind,
      freeText,
    ]),
    [
      ["units_total", null],
      ["other", GENUINE_NOTE],
    ],
  );
});

test("an advisory alternative inside one_of is left alone", () => {
  // Removing the advisory alternative would make MATH1013 compulsory.
  const assumed = "A background in secondary school calculus is assumed.";
  const rule = {
    op: "one_of",
    rules: [
      { op: "completed", courseCode: "MATH1013" },
      { op: "note", sourceText: assumed, recommended: true },
    ],
  };
  const requisites = withoutAssumedKnowledgeRepeats(
    course({ assumed, text: "Completed MATH1013.", rule }).requisites,
  );
  assert.deepEqual(requisites.prerequisiteRule, rule);
});

test("a prerequisite that only repeats assumed knowledge is dropped", () => {
  const model = course({
    assumed: MUSI1101_ASSUMED,
    text: MUSI1101_AUDITION,
    rule: { op: "note", sourceText: MUSI1101_AUDITION },
  });

  assert.equal(ruleOf(model, "prerequisite"), undefined);
  assert.equal(ruleOf(model, "assumed_knowledge").hardness, "advisory");
});

test("unmodelled wording repeating assumed knowledge is removed", () => {
  const model = course({
    assumed: MUSI1101_ASSUMED,
    text: `To enrol you must have completed MUSI1100.\n\n${MUSI1101_AUDITION}`,
    rule: { op: "completed", courseCode: "MUSI1100" },
    unmodelled: [MUSI1101_AUDITION],
  });

  assert.deepEqual(
    conditions(model, "prerequisite").map(({ conditionKind }) => conditionKind),
    ["course"],
  );
});

test("placeholder assumed knowledge does not become a rule", () => {
  for (const assumed of ["N/A", "NA", "None", "none.", "Not applicable"]) {
    assert.equal(isPlaceholderText(assumed), true, assumed);
    const model = course({ assumed, text: null });
    assert.equal(ruleOf(model, "assumed_knowledge"), undefined, assumed);
  }
  assert.equal(isPlaceholderText("None of the above courses"), false);
});

test("placeholder prerequisite notes and text are dropped", () => {
  const withNote = course({
    assumed: null,
    text: "To enrol you must have completed 24 units.",
    rule: {
      op: "all_of",
      rules: [
        { op: "min_units_total", minimumUnits: 24 },
        { op: "note", sourceText: "N/A" },
      ],
    },
  });
  assert.deepEqual(
    conditions(withNote, "prerequisite").map(
      ({ conditionKind }) => conditionKind,
    ),
    ["units_total"],
  );

  const textOnly = course({ assumed: null, text: "None" });
  assert.equal(ruleOf(textOnly, "prerequisite"), undefined);
});

test("an assumed knowledge rule beside only an incompatibility is dropped", () => {
  const assumed = "No specific knowledge required.";
  const model = course({
    assumed,
    text: `Incompatible with ENVS1003\n\n${assumed}`,
    rule: { op: "note", sourceText: assumed, recommended: true },
  });
  model.requisites.incompatibilityText = "Incompatible with ENVS1003";
  model.requisites.incompatibilityCourseCodes = ["ENVS1003"];

  assert.equal(ruleOf(model, "prerequisite"), undefined);
  assert.equal(ruleOf(model, "incompatibility").hardness, "hard");
});

test("an advisory note inside a route of a one_of is removed but the route stays", () => {
  const assumed =
    "Students undertaking any ANU Law School graduate program may apply for this course if they have the required law background.";
  const requisites = withoutAssumedKnowledgeRepeats(
    course({
      assumed,
      text: "Completed LAWS8586.",
      rule: {
        op: "one_of",
        rules: [
          { op: "completed", courseCode: "LAWS8586" },
          {
            op: "all_of",
            rules: [
              {
                op: "enrolled_in_career",
                career: "postgraduate",
                matches: true,
              },
              {
                op: "note",
                sourceText: "they have the required law background",
              },
            ],
          },
        ],
      },
    }).requisites,
  );
  assert.deepEqual(requisites.prerequisiteRule, {
    op: "one_of",
    rules: [
      { op: "completed", courseCode: "LAWS8586" },
      { op: "enrolled_in_career", career: "postgraduate", matches: true },
    ],
  });
});

test("an assumed knowledge rule beside unmodelled wording keeps only that wording", () => {
  const assumed =
    "It is recommended that students enrolling in this course have a Distinction average for the pre-requisite courses.";
  const unmodelled =
    "To enrol in this course, you must have completed ECON2101 and ECON2102 or ECON2016.";
  const model = course({
    assumed,
    text: unmodelled,
    rule: { op: "note", sourceText: assumed, recommended: true },
    unmodelled: [unmodelled],
  });

  assert.deepEqual(
    conditions(model, "prerequisite").map(({ conditionKind, freeText }) => [
      conditionKind,
      freeText,
    ]),
    [["other", unmodelled]],
  );
});

test("an assumed knowledge rule beside unrelated wording keeps its form", () => {
  const assumed = "Background knowledge in Photovoltaic Technology is useful.";
  const rule = { op: "note", sourceText: assumed, recommended: true };
  const requisites = withoutAssumedKnowledgeRepeats(
    course({
      assumed,
      text: "In AI-free assessments, students must complete the work without generative AI assistance.",
      rule,
    }).requisites,
  );
  assert.deepEqual(requisites.prerequisiteRule, rule);
});
