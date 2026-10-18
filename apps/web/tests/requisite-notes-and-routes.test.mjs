import assert from "node:assert/strict";
import { test } from "vitest";
import { compactCourseAdapter } from "../lib/catalogue-import/kinds/course/compact-adapter.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import { readCourseSource } from "../lib/catalogue-import/kinds/course/source-parser.ts";
import {
  liftRepresentedEligibilityFlags,
  ruleCoversClause,
} from "../lib/catalogue-import/kinds/course/source-review.ts";
import {
  requirementWriteWithTree,
  treeFromRequirementWrite,
} from "../lib/catalogue-import/requirement-tree.ts";
import { courseCatalogueContent } from "../lib/catalogue/content.ts";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression.ts";
import { readProjectionPrerequisiteRule } from "../lib/coursemap/published-courses.ts";
import {
  conditionSummary,
  validateReviewedTree,
} from "../lib/coursemap/requisite-conditions.ts";
import {
  evaluateRule,
  isSoftExpression,
} from "../lib/coursemap/requisite-evaluation.ts";
import { evaluateCoursePrerequisites } from "../lib/planner.ts";
import {
  requisiteNoun,
  requisiteSentence,
  softRequirementLabel,
  splitRequisiteRule,
} from "../ui/courses/requisite-wording.ts";

// Wording from the 2026 ANU pages for these courses.
const MEDI8012_ASSUMED =
  "Enrolment assumes that students are able to apply foundational concepts and knowledge learnt in MEDI8011 to the physiological systems and clinical skills curricula addressed in MEDI8012.";
const PSYC9421_CHECKS = [
  "Provisional Registration with the Psychology Board of Australia,",
  "National Police Certificate - Students must complete a National Police Check.",
  "Immunisation Record – Students must ensure their immunisations are current.",
  "Working with Vulnerable People Registration – Students must complete a WWVP check.",
];
const PSYC9421_PERMISSION =
  "You will need to contact the School of Medicine and Psychology to request a permission code to enrol in this course.";
const BIAN4011_UNITS =
  "144 units of Bachelor of Philosophy (Arts) (APHAR or APNAR) courses";

const MEDI8012_RULE = {
  op: "all_of",
  rules: [
    { op: "enrolled_in", programmeCode: "8950XMCHD" },
    { op: "completed_or_concurrent", courseCode: "MEDI8015" },
    {
      op: "soft",
      rule: { op: "completed", courseCode: "MEDI8011" },
      sourceText: MEDI8012_ASSUMED,
    },
  ],
};
const PSYC9421_RULE = {
  op: "all_of",
  rules: [
    { op: "enrolled_in", programmeCode: "9064" },
    { op: "permission", sourceText: PSYC9421_PERMISSION },
    ...PSYC9421_CHECKS.map((sourceText) => ({
      op: "note",
      sourceText,
      required: true,
    })),
  ],
};
// The Master of Applied Accounting's code is not printed; MAPAC stands in
// for a resolved code so the route can be checked.
const BUSN7017_RULE = {
  op: "one_of",
  rules: [
    {
      op: "all_of",
      rules: [
        { op: "enrolled_in", programmeCode: "MAPAC" },
        { op: "completed_or_concurrent", courseCode: "BUSN7008" },
      ],
    },
    {
      op: "all_of",
      rules: [
        { op: "enrolled_in", programmeCode: "MAPAC", matches: false },
        { op: "min_units_total", minimumUnits: 24 },
      ],
    },
  ],
};
const BIAN4011_RULE = {
  op: "one_of",
  rules: [
    {
      op: "soft",
      rule: {
        op: "min_units_in_field",
        minimumUnits: 144,
        field: "Bachelor of Philosophy (Arts) (APHAR or APNAR) courses",
      },
      sourceText: BIAN4011_UNITS,
    },
    { op: "enrolled_in", programmeCode: "HARTS" },
    { op: "enrolled_in", programmeCode: "HART2" },
    { op: "enrolled_in", programmeCode: "HASIA" },
    { op: "permission", sourceText: "with permission of the convener" },
  ],
};

function modelWith(code, rule, text = "Text") {
  const model = emptyCourseExtraction({ code, year: 2026, title: code });
  model.requisites.prerequisiteText = text;
  model.requisites.prerequisiteRule = rule;
  return model;
}

function issues(rule) {
  const result = validateCourseExtraction(modelWith("PSYC9421", rule));
  return result.success ? [] : result.issues.map((issue) => issue.message);
}

/**
 * A rule as the course page reads it. Programme conditions become structure
 * conditions in content, as the database stores them, so the expression is
 * read from the content rather than the raw projection.
 */
function projected(code, rule) {
  const projection = projectCourseSnapshot(modelWith(code, rule));
  const { requirements } = courseCatalogueContent({ projection });
  const expression = requirementSliceExpression({
    groups: requirements.groups.filter(
      (group) => group.ruleKey === "prerequisite",
    ),
    conditions: requirements.conditions.filter(
      (condition) => condition.ruleKey === "prerequisite",
    ),
    options: requirements.options,
  });
  return {
    projection,
    projected: readProjectionPrerequisiteRule(projection).relationalExpression,
    rule: {
      confidence: 1,
      expression: null,
      hardness: "hard",
      relationalExpression: expression,
      reviewState: "verified",
      sourceText: "Text",
    },
    expression,
  };
}

function student(overrides = {}) {
  return {
    completed: new Map(),
    enrolled: new Set(),
    programmeCodes: [],
    wam: null,
    gpa: null,
    studyYear: null,
    ...overrides,
  };
}

function units(count) {
  return new Map(
    Array.from({ length: count }, (_, index) => [
      `ARTS10${String(index).padStart(2, "0")}`,
      { units: 6, mark: null },
    ]),
  );
}

function plannerState(code, rule, attempts = [], overrides = {}) {
  const prerequisiteRule = projected(code, rule).rule;
  const verify = (node) => {
    node.reviewState = "verified";
    if (node.kind === "group") node.conditions.forEach(verify);
  };
  verify(prerequisiteRule.relationalExpression);
  return evaluateCoursePrerequisites(
    {
      id: "target",
      courseCode: code,
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned",
      ...overrides,
    },
    attempts,
    {
      courses: [
        { code, year: 2026, units: 6, prerequisiteRule },
        ...attempts.map((attempt) => ({
          code: attempt.courseCode,
          year: 2026,
          units: 6,
        })),
      ],
      terms: [
        { id: "2026-s1", year: 2026, name: "S1", shortName: "S1", dates: "" },
        { id: "2026-s2", year: 2026, name: "S2", shortName: "S2", dates: "" },
      ],
    },
  ).state;
}

test("the contract accepts the new forms and keeps earlier answers valid", () => {
  for (const rule of [
    MEDI8012_RULE,
    PSYC9421_RULE,
    BUSN7017_RULE,
    BIAN4011_RULE,
    {
      op: "note",
      sourceText: "Completion of a cognate major.",
      recommended: true,
    },
    // Earlier answers have no flags and stay valid.
    { op: "note", sourceText: "Students are required to audition." },
    { op: "enrolled_in", programmeTitle: "Master of Applied Accounting" },
  ])
    assert.deepEqual(issues(rule), []);
  assert.ok(
    issues({
      op: "note",
      sourceText: "A police check.",
      required: true,
      recommended: true,
    }).includes("must not be both required and recommended"),
  );
  assert.ok(
    issues({ op: "enrolled_in", programmeCode: "MAPAC", matches: "no" })
      .length > 0,
  );
});

test("a required note is stored as an advisory note labelled required", () => {
  const {
    projection,
    expression,
    projected: fromProjection,
  } = projected("PSYC9421", PSYC9421_RULE);
  assert.equal(fromProjection.conditions[2].noteKind, "required");
  const notes = projection.ruleConditions.filter(
    (condition) => condition.conditionKind === "other",
  );
  assert.deepEqual(
    notes.map((condition) => [condition.hardness, condition.noteKind]),
    PSYC9421_CHECKS.map(() => ["advisory", "required"]),
  );
  const content = courseCatalogueContent({ projection });
  assert.deepEqual(
    content.requirements.conditions
      .filter((condition) => condition.kind === "other")
      .map((condition) => condition.noteKind),
    PSYC9421_CHECKS.map(() => "required"),
  );
  // Ordinary notes and every other kind keep their earlier shape and hash.
  assert.equal(
    content.requirements.conditions.some(
      (condition) => condition.kind !== "other" && "noteKind" in condition,
    ),
    false,
  );
  const slice = requirementSliceExpression(content.requirements);
  assert.equal(slice.conditions[2].noteKind, "required");
  assert.equal(expression.conditions[2].noteKind, "required");
});

test("a required note never blocks a student or a plan and reads Required", () => {
  const { expression } = projected("PSYC9421", PSYC9421_RULE);
  const enrolled = student({
    programmeCodes: ["9064"],
    permissionApproved: true,
  });
  assert.equal(evaluateRule(expression, enrolled).status, "met");
  assert.notEqual(
    evaluateRule(expression, { ...enrolled, programmeCodes: [] }).status,
    "met",
  );
  for (const note of expression.conditions.slice(2))
    assert.ok(isSoftExpression(note));
  // A hard note an administrator left labelled still never blocks.
  assert.ok(
    isSoftExpression({ ...expression.conditions[2], hardness: "hard" }),
  );

  const split = splitRequisiteRule(expression);
  assert.deepEqual(
    split.soft.map(softRequirementLabel),
    PSYC9421_CHECKS.map(() => "Required"),
  );
  assert.deepEqual(split.notes, []);

  // Only the programme and permission are checked; the notes are not.
  const noteOnly = {
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 6 },
      { op: "note", sourceText: PSYC9421_CHECKS[1], required: true },
    ],
  };
  assert.equal(
    plannerState("PSYC9421", noteOnly, [
      {
        id: "prior",
        courseCode: "ARTS1000",
        academicYear: 2026,
        termId: "2026-s1",
        status: "completed",
        units: 6,
      },
    ]),
    "satisfied",
  );
});

test("the admin editor round-trips note labels and not-enrolled programmes", () => {
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(
      modelWith("BUSN7017", {
        op: "all_of",
        rules: [
          ...BUSN7017_RULE.rules[1].rules,
          { op: "note", sourceText: PSYC9421_CHECKS[1], required: true },
        ],
      }),
    ),
  });
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated, validated.message);
  const [programme, , note] = validated.tree.children;
  assert.equal(programme.matchesStructure, false);
  assert.equal(conditionSummary(programme), "Not enrolled in MAPAC");
  assert.equal(note.noteKind, "required");
  assert.equal(note.hardness, "advisory");
  assert.match(conditionSummary(note), /^Required note: /u);
  const next = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    "Text",
  );
  assert.deepEqual(
    next.conditions.map((condition) => [
      condition.kind,
      condition.matchesStructure ?? null,
      condition.noteKind ?? null,
      condition.hardness,
    ]),
    [
      ["structure", false, null, "hard"],
      ["units_total", null, null, "hard"],
      ["other", null, "required", "advisory"],
    ],
  );
  // A label forces the note soft even when the editor sent hard.
  const forced = validateReviewedTree({
    operator: "all_of",
    children: [
      {
        type: "condition",
        kind: "other",
        freeText: "Police check.",
        hardness: "hard",
        noteKind: "required",
      },
    ],
  });
  assert.equal(forced.tree.children[0].hardness, "advisory");
  assert.ok(
    "message" in
      validateReviewedTree({
        operator: "all_of",
        children: [
          {
            type: "condition",
            kind: "other",
            freeText: "Police check.",
            noteKind: "mandatory",
          },
        ],
      }),
  );
});

test("students in other programs take the units route", () => {
  const { projection, expression } = projected("BUSN7017", BUSN7017_RULE);
  const negated = projection.ruleConditions.filter(
    (condition) => condition.matchesStructure === false,
  );
  assert.equal(negated.length, 1);
  assert.equal(negated[0].requiredStructureCode, "MAPAC");
  const content = courseCatalogueContent({ projection });
  assert.equal(
    content.requirements.conditions.filter(
      (condition) => condition.matchesStructure === false,
    ).length,
    1,
  );
  // Absent on positive programme conditions, so their hash is unchanged.
  assert.equal(
    content.requirements.conditions.filter(
      (condition) => "matchesStructure" in condition,
    ).length,
    1,
  );

  const otherProgram = student({
    programmeCodes: ["BCOMM"],
    completed: units(4),
  });
  assert.equal(evaluateRule(expression, otherProgram).status, "met");
  assert.notEqual(
    evaluateRule(expression, { ...otherProgram, completed: units(2) }).status,
    "met",
  );
  // A Master of Applied Accounting student needs BUSN7008, not just units.
  const accounting = student({
    programmeCodes: ["MAPAC"],
    completed: units(4),
  });
  assert.notEqual(evaluateRule(expression, accounting).status, "met");
  assert.equal(
    evaluateRule(expression, {
      ...accounting,
      enrolled: new Set(["BUSN7008"]),
    }).status,
    "met",
  );

  const route = expression.conditions[1].conditions[0];
  assert.equal(route.matchesStructure, false);
  assert.equal(requisiteNoun(route), "Not enrolled in MAPAC");
  assert.equal(requisiteSentence(route), "Be in a program other than MAPAC");

  // A programme named only by title cannot be checked either way.
  const titled = projected("BUSN7017", {
    op: "all_of",
    rules: [
      {
        op: "enrolled_in",
        programmeTitle: "Master of Applied Accounting",
        matches: false,
      },
      { op: "min_units_total", minimumUnits: 24 },
    ],
  }).expression;
  assert.equal(evaluateRule(titled, otherProgram).status, "unknown");
});

test("units of a programme's courses are soft and never block", () => {
  const { projection, expression } = projected("BIAN4011", BIAN4011_RULE);
  assert.deepEqual(
    [
      projection.ruleConditions[0].conditionKind,
      projection.ruleConditions[0].hardness,
      projection.ruleConditions[0].freeText,
    ],
    [
      "field_units",
      "advisory",
      "Bachelor of Philosophy (Arts) (APHAR or APNAR) courses",
    ],
  );
  assert.equal(
    evaluateRule(expression, student({ programmeCodes: ["HARTS"] })).status,
    "met",
  );
  // A Philosophy (Arts) student with 144 units cannot be ruled out.
  assert.equal(
    evaluateRule(
      expression,
      student({ programmeCodes: ["APHAR"], completed: units(24) }),
    ).status,
    "unknown",
  );
  assert.notEqual(plannerState("BIAN4011", BIAN4011_RULE), "unsatisfied");
});

test("assumed knowledge is recommended, never required", () => {
  const { expression } = projected("MEDI8012", MEDI8012_RULE);
  const split = splitRequisiteRule(expression);
  assert.equal(split.soft.length, 1);
  assert.equal(softRequirementLabel(split.soft[0]), "Recommended");
  const enrolled = student({
    programmeCodes: ["8950XMCHD"],
    enrolled: new Set(["MEDI8015"]),
  });
  // MEDI8011 is not completed, and that does not hold the student back.
  assert.equal(evaluateRule(expression, enrolled).status, "met");

  const prose = projected("BIAN4011", {
    op: "all_of",
    rules: [
      { op: "enrolled_in", programmeCode: "HARTS" },
      {
        op: "note",
        sourceText: "Completion of a cognate major.",
        recommended: true,
      },
    ],
  }).expression;
  assert.deepEqual(splitRequisiteRule(prose).soft.map(softRequirementLabel), [
    "Recommended",
  ]);
  assert.equal(
    evaluateRule(prose, student({ programmeCodes: ["HARTS"] })).status,
    "met",
  );

  const prompt = compactCourseAdapter.buildSystemPrompt();
  assert.match(prompt, /Assumed knowledge is always soft/u);
  assert.match(prompt, /required true/u);
  assert.match(prompt, /one note per sentence/u);
});

test("a soft clause from assumed knowledge covers its sentence", () => {
  const sentence =
    "Students are required to have knowledge equivalent to MATH1013 and STAT1003.";
  const markdown = [
    "# Statistics",
    "",
    "## Requisite and Incompatibility",
    "",
    "Incompatible with STAT2005.",
    "",
    "## Assumed Knowledge",
    "",
    sentence,
    "",
  ].join("\n");
  const { course, eligibilityClauses } = readCourseSource({
    code: "STAT2001",
    year: 2026,
    markdown,
  });
  assert.deepEqual(
    eligibilityClauses.map((entry) => entry.clauses),
    [[sentence]],
  );
  const partial = {
    op: "soft",
    rule: { op: "completed", courseCode: "MATH1013" },
    sourceText: "knowledge equivalent to MATH1013",
  };
  // One code of two leaves the sentence unrepresented, and the error names it.
  assert.equal(ruleCoversClause([partial], sentence), false);
  const held = structuredClone(course);
  held.requisites.prerequisiteRule = partial;
  assert.equal(liftRepresentedEligibilityFlags(held, eligibilityClauses), 0);
  assert.ok(
    held.reviewItems.some(
      (item) => item.severity === "error" && item.sourceExcerpt === sentence,
    ),
  );

  const both = {
    op: "soft",
    rule: {
      op: "all_of",
      rules: [
        { op: "completed", courseCode: "MATH1013" },
        { op: "completed", courseCode: "STAT1003" },
      ],
    },
    sourceText: "knowledge equivalent to MATH1013 and STAT1003",
  };
  assert.ok(ruleCoversClause([both], sentence));
  // A hard rule with the same codes is not a soft representation.
  assert.equal(
    ruleCoversClause([both.rule], sentence, { softOnly: true }),
    false,
  );
  const lifted = structuredClone(course);
  lifted.requisites.prerequisiteRule = both;
  assert.ok(liftRepresentedEligibilityFlags(lifted, eligibilityClauses) > 0);
  assert.equal(
    lifted.reviewItems.some(
      (item) =>
        item.severity === "error" &&
        item.message.startsWith("The assumed knowledge section"),
    ),
    false,
  );
});
