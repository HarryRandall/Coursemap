import assert from "node:assert/strict";
import { test } from "vitest";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
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
import { validateReviewedTree } from "../lib/coursemap/requisite-conditions.ts";
import {
  evaluateCondition,
  evaluateRule,
  isSoftExpression,
} from "../lib/coursemap/requisite-evaluation.ts";
import { evaluateCoursePrerequisites } from "../lib/planner.ts";
import {
  requisiteSentence,
  softRequirementLabel,
  splitRequisiteRule,
} from "../ui/courses/requisite-wording.ts";

// Wording from approved 2026 answers. Only the clauses each example models
// are reproduced; the hard clauses alongside them are illustrative.
const LANGUAGE_SEQUENCE_TEXT =
  "Students are not permitted to enrol in a language course below one that they have already successfully completed, except with permission of the language and/or course convenor.";
const PHYS1201_TEXT =
  "You should have completed either MATH1013 or MATH1115 or be doing them concurrently";
const SCNC3000_TEXT =
  "To enrol in this course you must be enrolled in a science degree and have completed 48 units, with at least a Credit average in Science courses (5.0 GPA). Enrolment will be dependent on a suitable placement being available.";
const SOCY2038_TEXT =
  "To enrol in this course you must have completed 24 units of tertiary study or 12 units in the relevant field/discipline.";

const VIET2003_RULE = {
  op: "all_of",
  rules: [
    { op: "completed", courseCode: "VIET2002" },
    {
      op: "soft",
      rule: { op: "no_higher_course_in_subject", subjectCode: "VIET" },
      sourceText: LANGUAGE_SEQUENCE_TEXT,
    },
  ],
};
const PHYS1201_RULE = {
  op: "soft",
  sourceText: PHYS1201_TEXT,
  rule: {
    op: "one_of",
    rules: [
      { op: "completed_or_concurrent", courseCode: "MATH1013" },
      { op: "completed_or_concurrent", courseCode: "MATH1115" },
    ],
  },
};
const SCNC3000_RULE = {
  op: "all_of",
  rules: [
    {
      op: "soft",
      rule: { op: "enrolled_in_programme_family", family: "a science degree" },
      sourceText: "must be enrolled in a science degree",
    },
    { op: "min_units_total", minimumUnits: 48 },
    {
      op: "soft",
      rule: {
        op: "minimum_gpa",
        value: 5,
        scale: "anu7",
        scopeText: "Science courses",
      },
      sourceText: "with at least a Credit average in Science courses (5.0 GPA)",
    },
    {
      op: "note",
      sourceText:
        "Enrolment will be dependent on a suitable placement being available.",
    },
  ],
};
const SOCY2038_RULE = {
  op: "one_of",
  rules: [
    { op: "min_units_total", minimumUnits: 24 },
    {
      op: "soft",
      rule: {
        op: "min_units_in_field",
        minimumUnits: 12,
        field: "the relevant field/discipline",
      },
      sourceText: "12 units in the relevant field/discipline",
    },
  ],
};

function modelWith(code, rule, text) {
  const model = emptyCourseExtraction({ code, year: 2026, title: code });
  model.requisites.prerequisiteText = text;
  model.requisites.prerequisiteRule = rule;
  return model;
}

function issues(rule) {
  const result = validateCourseExtraction(modelWith("SCNC3000", rule, "Text"));
  return result.success ? [] : result.issues.map((issue) => issue.message);
}

function projected(code, rule, text) {
  const projection = projectCourseSnapshot(modelWith(code, rule, text));
  const expression = readProjectionPrerequisiteRule(projection);
  return {
    projection,
    rule: expression,
    expression: expression.relationalExpression,
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

function completed(...codes) {
  return new Map(codes.map((code) => [code, { units: 6, mark: null }]));
}

test("the contract accepts every soft form and rejects ambiguous ones", () => {
  for (const rule of [
    VIET2003_RULE,
    PHYS1201_RULE,
    SCNC3000_RULE,
    SOCY2038_RULE,
  ])
    assert.deepEqual(issues(rule), []);
  assert.deepEqual(
    issues({
      op: "minimum_gpa",
      value: 5,
      scale: "anu7",
      subjectCodes: ["BIOL", "CHEM"],
      courseCodes: ["SCNC1001"],
    }),
    [],
  );
  assert.ok(
    issues({
      op: "soft",
      rule: { op: "note", sourceText: "Audition." },
    })[0]?.startsWith("is already soft"),
  );
  assert.ok(
    issues({
      op: "soft",
      rule: { op: "soft", rule: { op: "min_units_total", minimumUnits: 6 } },
    })[0]?.startsWith("is already soft"),
  );
  assert.ok(
    issues({
      op: "minimum_gpa",
      value: 5,
      scale: "anu7",
      subjectCodes: ["BIOL"],
      recentGradedUnits: 48,
    }).includes(
      "must not combine a most-recent graded-units window with a subject or course scope",
    ),
  );
  assert.ok(
    issues({ op: "minimum_gpa", value: 5, scale: "anu7", subjectCodes: [] })
      .length > 0,
  );
  assert.ok(issues({ op: "note", sourceText: "" }).length > 0);
  assert.ok(
    issues({ op: "no_higher_course_in_subject", subjectCode: "Viet" }).length >
      0,
  );
  assert.ok(
    issues({ op: "min_units_in_field", minimumUnits: 0, field: "a field" })
      .length > 0,
  );
});

test("soft wrappers project advisory conditions and keep the rule hard", () => {
  const phys = projected("PHYS1201", PHYS1201_RULE, PHYS1201_TEXT);
  assert.equal(phys.projection.rules[0].hardness, "hard");
  assert.equal(phys.expression.operator, "any_of");
  assert.deepEqual(
    phys.projection.ruleConditions.map((condition) => [
      condition.requiredCourseCode,
      condition.hardness,
    ]),
    [
      ["MATH1013", "advisory"],
      ["MATH1115", "advisory"],
    ],
  );
  assert.ok(isSoftExpression(phys.expression));

  const scnc = projected("SCNC3000", SCNC3000_RULE, SCNC3000_TEXT);
  assert.deepEqual(
    scnc.projection.ruleConditions.map((condition) => [
      condition.conditionKind,
      condition.hardness,
      condition.freeText,
    ]),
    [
      ["structure", "advisory", "a science degree"],
      ["units_total", "hard", null],
      ["gpa", "advisory", "Science courses"],
      [
        "other",
        "advisory",
        "Enrolment will be dependent on a suitable placement being available.",
      ],
    ],
  );

  const viet = projected("VIET2003", VIET2003_RULE, LANGUAGE_SEQUENCE_TEXT);
  const sequence = viet.projection.ruleConditions[1];
  assert.equal(sequence.conditionKind, "subject_sequence");
  assert.equal(sequence.freeText, "VIET2003");
  assert.equal(sequence.subjectCode, "VIET");
  assert.equal(sequence.hardness, "advisory");
  // The course is the sequence's anchor, not a prerequisite of itself.
  assert.deepEqual(
    viet.projection.ruleCourseReferences.map(
      (item) => item.referencedCourseCode,
    ),
    ["VIET2002"],
  );
  const content = courseCatalogueContent({ projection: viet.projection });
  assert.equal(content.requirements.conditions[1].itemCode, null);
  assert.equal(viet.expression.conditions[1].code, "VIET2003");
});

test("a note is soft even without a wrapper", () => {
  const { projection } = projected(
    "MUSI2240",
    {
      op: "all_of",
      rules: [
        { op: "completed", courseCode: "MUSI1100" },
        { op: "note", sourceText: "Students are required to audition." },
      ],
    },
    "Students are required to audition.",
  );
  assert.equal(projection.ruleConditions[1].hardness, "advisory");
});

test("a scoped average keeps its subjects and courses, and an unscoped one is unchanged", () => {
  const { projection, expression } = projected(
    "SCNC3000",
    {
      op: "minimum_gpa",
      value: 5,
      scale: "anu7",
      subjectCodes: ["CHEM", "BIOL"],
      courseCodes: ["SCNC2101"],
    },
    "A GPA of 5 in BIOL and CHEM courses and SCNC2101.",
  );
  assert.deepEqual(projection.ruleConditions[0].subjectCodes, ["BIOL", "CHEM"]);
  assert.deepEqual(
    projection.ruleConditionCourses.map((item) => item.sourceCourseCode),
    ["SCNC2101"],
  );
  // The average's courses are its scope, not prerequisites.
  assert.deepEqual(projection.ruleCourseReferences, []);
  const content = courseCatalogueContent({ projection });
  assert.deepEqual(content.requirements.conditions[0].subjectCodes, [
    "BIOL",
    "CHEM",
  ]);
  assert.equal(expression.conditions[0].kind, "gpa");
  assert.deepEqual(expression.conditions[0].subjects, ["BIOL", "CHEM"]);
  assert.deepEqual(expression.conditions[0].courseCodes, ["SCNC2101"]);

  const unscoped = courseCatalogueContent({
    projection: projectCourseSnapshot(
      modelWith(
        "SCNC3000",
        { op: "minimum_gpa", value: 5, scale: "anu7" },
        "A GPA of 5.",
      ),
    ),
  }).requirements.conditions[0];
  assert.equal("subjectCodes" in unscoped, false);
  assert.equal(unscoped.freeText, null);
});

test("soft conditions never count against a student", () => {
  const scnc = projected("SCNC3000", SCNC3000_RULE, SCNC3000_TEXT).expression;
  const record = student({
    completed: new Map(
      Array.from({ length: 8 }, (_, index) => [
        `PHYS10${String(index).padStart(2, "0")}`,
        { units: 6, mark: null },
      ]),
    ),
  });
  // 48 hard units are met; the unknown family, scope and placement are soft.
  assert.equal(evaluateRule(scnc, record).status, "met");
  assert.equal(evaluateRule(scnc, student()).status, "unmet");

  // A soft alternative does not make the hard one stricter or let it pass.
  const socy = projected("SOCY2038", SOCY2038_RULE, SOCY2038_TEXT).expression;
  assert.equal(evaluateRule(socy, student()).status, "unknown");
  assert.equal(
    evaluateRule(socy, student({ completed: completed("A", "B", "C", "D") }))
      .status,
    "met",
  );

  // A wholly soft rule still reports its own progress for display.
  const phys = projected("PHYS1201", PHYS1201_RULE, PHYS1201_TEXT).expression;
  assert.equal(evaluateRule(phys, student()).status, "unmet");
  assert.equal(
    evaluateRule(phys, student({ enrolled: new Set(["MATH1115"]) })).status,
    "met",
  );
});

test("the planner never blocks on a soft requirement", () => {
  const terms = [
    {
      id: "2026-s1",
      year: 2026,
      name: "Semester 1",
      shortName: "S1",
      dates: "",
    },
    {
      id: "2026-s2",
      year: 2026,
      name: "Semester 2",
      shortName: "S2",
      dates: "",
    },
  ];
  const verified = (rule) => {
    rule.reviewState = "verified";
    const visit = (node) => {
      node.reviewState = "verified";
      if (node.kind === "group") node.conditions.forEach(visit);
    };
    visit(rule.relationalExpression);
    return rule;
  };
  const state = (code, rule, text, attempts = []) => {
    const prerequisiteRule = verified(projected(code, rule, text).rule);
    const target = {
      id: "target",
      courseCode: code,
      academicYear: 2026,
      termId: "2026-s2",
      status: "planned",
    };
    return evaluateCoursePrerequisites(target, attempts, {
      courses: [{ code, year: 2026, units: 6, prerequisiteRule }],
      terms,
    }).state;
  };
  assert.equal(state("PHYS1201", PHYS1201_RULE, PHYS1201_TEXT), "satisfied");
  assert.equal(state("SOCY2038", SOCY2038_RULE, SOCY2038_TEXT), "unknown");
  assert.equal(
    state("VIET2003", VIET2003_RULE, LANGUAGE_SEQUENCE_TEXT, [
      {
        id: "higher",
        courseCode: "VIET3002",
        academicYear: 2026,
        termId: "2026-s1",
        status: "completed",
      },
    ]),
    "unsatisfied",
  );
  assert.equal(
    state("VIET2003", VIET2003_RULE, LANGUAGE_SEQUENCE_TEXT, [
      {
        id: "prior",
        courseCode: "VIET2002",
        academicYear: 2026,
        termId: "2026-s1",
        status: "completed",
      },
      {
        id: "higher",
        courseCode: "VIET3002",
        academicYear: 2026,
        termId: "2026-s1",
        status: "completed",
      },
    ]),
    "satisfied",
  );
});

test("the language sequence compares course numbers within the subject", () => {
  const condition = {
    kind: "subject_sequence",
    subject: "VIET",
    code: "VIET2003",
    hardness: "advisory",
    confidence: 1,
    reviewState: "verified",
    sourceText: LANGUAGE_SEQUENCE_TEXT,
  };
  assert.equal(
    evaluateCondition(condition, student({ completed: completed("VIET2002") }))
      .status,
    "met",
  );
  const later = evaluateCondition(
    condition,
    student({ completed: completed("VIET2002", "VIET3002", "INDN3002") }),
  );
  assert.equal(later.status, "unmet");
  assert.match(later.detail, /VIET3002/u);
  assert.equal(
    evaluateCondition(condition, student({ completed: completed("VIET2003") }))
      .status,
    "met",
  );
});

test("a scoped average uses only the courses in its scope", () => {
  const base = {
    kind: "gpa",
    minimumGpa: 5,
    hardness: "hard",
    confidence: 1,
    reviewState: "verified",
    sourceText: "",
  };
  const results = [
    { courseCode: "BIOL1003", mark: 80, units: 6, periodStartsOn: null },
    { courseCode: "CHEM1101", mark: 72, units: 6, periodStartsOn: null },
    { courseCode: "ARTH1001", mark: 50, units: 6, periodStartsOn: null },
  ];
  const record = student({ academicResults: results, gpa: 5 });
  const scoped = evaluateCondition(
    { ...base, subjects: ["BIOL", "CHEM"] },
    record,
  );
  assert.equal(scoped.status, "met");
  assert.equal(scoped.measure.value, 6.5);
  assert.equal(
    evaluateCondition(
      { ...base, minimumGpa: 6, courseCodes: ["CHEM1101", "ARTH1001"] },
      record,
    ).status,
    "unmet",
  );
  // A scope printed without codes cannot be checked.
  assert.equal(
    evaluateCondition({ ...base, scopeText: "Science courses" }, record).status,
    "unknown",
  );
  // Results whose course is unknown cannot prove a scoped average.
  assert.equal(
    evaluateCondition(
      { ...base, subjects: ["BIOL"] },
      student({
        academicResults: [{ mark: 80, units: 6, periodStartsOn: null }],
      }),
    ).status,
    "unknown",
  );
});

test("programme families stay unchecked and programme lists are checked", () => {
  const family = projected(
    "PHIL4010",
    {
      op: "soft",
      rule: {
        op: "enrolled_in_programme_family",
        family: "a Master of Engineering",
      },
    },
    "Enrolled in a Master of Engineering.",
  ).expression;
  assert.equal(family.kind, "group");
  const condition = family.conditions[0];
  assert.equal(condition.kind, "structure");
  assert.equal(condition.text, "a Master of Engineering");
  assert.equal(evaluateCondition(condition, student()).status, "unknown");

  // Programme codes are stored as structure conditions, as the database holds them.
  const requirements = courseCatalogueContent({
    projection: projectCourseSnapshot(
      modelWith(
        "PHIL4010",
        {
          op: "one_of",
          rules: [
            { op: "enrolled_in", programmeCode: "AHPHI" },
            { op: "enrolled_in", programmeCode: "HPHIL" },
          ],
        },
        "Enrolled in AHPHI or HPHIL.",
      ),
    ),
  }).requirements;
  const list = requirementSliceExpression({
    groups: requirements.groups,
    conditions: requirements.conditions,
    options: requirements.options,
  });
  assert.equal(
    evaluateRule(list, student({ programmeCodes: ["HPHIL"] })).status,
    "met",
  );
  assert.equal(
    evaluateRule(list, student({ programmeCodes: ["BSC"] })).status,
    "unmet",
  );
});

test("course pages separate soft requirements and label them", () => {
  const scnc = projected("SCNC3000", SCNC3000_RULE, SCNC3000_TEXT).expression;
  const split = splitRequisiteRule(scnc);
  assert.equal(split.requirements.length, 1);
  assert.equal(split.notes.length, 0);
  assert.deepEqual(split.soft.map(softRequirementLabel), [
    "You'll also need",
    "You'll also need",
    "You'll also need",
  ]);
  assert.equal(
    requisiteSentence(split.soft[1]),
    "Have a GPA of 5 or more in Science courses",
  );
  const phys = projected("PHYS1201", PHYS1201_RULE, PHYS1201_TEXT).expression;
  const physSplit = splitRequisiteRule(phys);
  assert.equal(physSplit.requirements.length, 0);
  assert.equal(softRequirementLabel(physSplit.soft[0]), "Recommended");
  const socy = projected("SOCY2038", SOCY2038_RULE, SOCY2038_TEXT).expression;
  assert.equal(
    requisiteSentence(socy.conditions[1]),
    "Complete 12 units in the relevant field/discipline",
  );
});

test("the admin editor round-trips soft conditions and the new kinds", () => {
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(
      modelWith(
        "VIET2003",
        {
          op: "all_of",
          rules: [
            ...VIET2003_RULE.rules,
            SOCY2038_RULE,
            {
              op: "minimum_gpa",
              value: 5,
              scale: "anu7",
              subjectCodes: ["VIET"],
            },
          ],
        },
        LANGUAGE_SEQUENCE_TEXT,
      ),
    ),
  });
  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated, validated.message);
  const next = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    LANGUAGE_SEQUENCE_TEXT,
  );
  const summary = (write) =>
    write.conditions.map((condition) => ({
      kind: condition.kind,
      hardness: condition.hardness,
      itemCode: condition.itemCode,
      subjectCode: condition.subjectCode,
      subjectCodes: condition.subjectCodes ?? null,
      minimumUnits: condition.minimumUnits,
      freeText:
        condition.kind === "field_units" ||
        condition.kind === "subject_sequence"
          ? condition.freeText
          : null,
    }));
  assert.deepEqual(summary(next), summary(content.requirements));
  assert.equal(
    next.references.some((reference) => reference.code === "VIET2003"),
    false,
  );
  // Reading the edited slice back gives the same soft shape.
  const expression = requirementSliceExpression({
    groups: next.groups,
    conditions: next.conditions,
    options: next.options,
  });
  assert.equal(expression.conditions[1].kind, "subject_sequence");
  assert.equal(expression.conditions[1].hardness, "advisory");
});

test("a soft clause covers an unscoped AND/OR sentence, a hard guess does not", () => {
  const sentence =
    "You should have completed MATH1013 and MATH1014 or MATH1115.";
  const page = `---\ncode: PHYS1201\n---\n## Requisite and Incompatibility\n\n${sentence}\n\n## Other\n`;
  const guess = {
    op: "one_of",
    rules: [
      {
        op: "all_of",
        rules: [
          { op: "completed", courseCode: "MATH1013" },
          { op: "completed", courseCode: "MATH1014" },
        ],
      },
      { op: "completed", courseCode: "MATH1115" },
    ],
  };
  const finalise = (rule) =>
    finaliseCourseExtraction({
      code: "PHYS1201",
      year: 2026,
      listingTitle: "Physics",
      model: modelWith("PHYS1201", rule, sentence),
      pageMarkdown: page,
      finishReason: "stop",
      responseError: null,
    });
  const hard = finalise(guess);
  assert.equal(hard.extraction.requisites.prerequisiteRule, null);
  assert.deepEqual(hard.extraction.requisites.unmodelledText, [sentence]);

  const soft = finalise({ op: "soft", rule: guess, sourceText: sentence });
  assert.notEqual(soft.extraction.requisites.prerequisiteRule, null);
  assert.deepEqual(soft.extraction.requisites.unmodelledText, []);
  assert.equal(
    soft.extraction.reviewItems.some(
      (item) => item.fieldKey === "requisites.unmodelledText",
    ),
    false,
  );
});

test("eligibility wording outside the requisite section is lifted once represented", () => {
  const application =
    "Students must submit an application form to the School of Music before enrolling.";
  const quota = "Enrolment in this course is subject to a quota.";
  const markdown = [
    "# Ensemble",
    "",
    "## Requisite and Incompatibility",
    "",
    "Incompatible with MUSI2205.",
    "",
    "## Other Information",
    "",
    application,
    "",
    quota,
    "",
  ].join("\n");
  const { course, eligibilityClauses } = readCourseSource({
    code: "MUSI2240",
    year: 2026,
    markdown,
  });
  const message =
    "The other information section includes eligibility wording that needs review.";
  assert.deepEqual(eligibilityClauses, [
    { message, clauses: [application, quota] },
  ]);
  const extraction = structuredClone(course);
  const errors = () =>
    extraction.reviewItems.filter(
      (item) => item.message.startsWith(message) && item.severity === "error",
    ).length;
  const before = errors();
  assert.ok(before > 0);

  // The application alone leaves the quota unrepresented.
  extraction.requisites.prerequisiteRule = {
    op: "note",
    sourceText: application,
  };
  assert.equal(
    liftRepresentedEligibilityFlags(extraction, eligibilityClauses),
    0,
  );
  assert.equal(errors(), before);

  extraction.requisites.prerequisiteRule = {
    op: "all_of",
    rules: [
      { op: "note", sourceText: application },
      { op: "note", sourceText: quota },
    ],
  };
  assert.equal(
    liftRepresentedEligibilityFlags(extraction, eligibilityClauses),
    before,
  );
  assert.equal(errors(), 0);
  assert.ok(
    extraction.reviewItems.some(
      (item) =>
        item.severity === "warning" &&
        item.message === `${message} The modelled rule represents it.`,
    ),
  );
  assert.equal(ruleCoversClause([null], quota), false);
});
