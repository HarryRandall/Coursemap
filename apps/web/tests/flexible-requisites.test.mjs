import assert from "node:assert/strict";
import { test } from "vitest";
import {
  courseFilterLabel,
  courseMatchesLevel,
} from "../lib/academic/course-code.ts";
import { careerEnrolmentStatus } from "../lib/academic/programme-career.ts";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
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
} from "../lib/coursemap/requisite-evaluation.ts";
import { sampleStudent } from "../lib/coursemap/requisite-samples.ts";
import { evaluateCoursePrerequisites } from "../lib/planner.ts";
import { requisiteSentence } from "../ui/courses/requisite-wording.ts";

const LAWS_COUNT = {
  op: "min_courses_matching",
  minimumCount: 5,
  subjectCodes: ["LAWS"],
  levels: [1000, 6100],
  includeConcurrent: true,
};
const POOLED_UNITS = {
  op: "min_units_matching",
  minimumUnits: 12,
  subjectCodes: ["CLAS", "GREK", "LATN", "HIST"],
  levels: null,
  includeConcurrent: false,
};
const LAWS_TEXT =
  "To enrol in this course you must have completed or be completing five 1000 or 6100 level LAWS courses.";

function modelWith(rule, text = LAWS_TEXT) {
  const model = emptyCourseExtraction({
    code: "LAWS6249",
    year: 2026,
    title: "Flexible requisite test",
  });
  model.requisites.prerequisiteText = text;
  model.requisites.prerequisiteRule = rule;
  return model;
}

function issues(rule) {
  const result = validateCourseExtraction(modelWith(rule));
  return result.success ? [] : result.issues.map((issue) => issue.message);
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

test.each([
  ["LAWS1201", 1000, true],
  ["LAWS6101", 6100, true],
  ["LAWS6201", 6100, false],
  ["LAWS6201", 6000, true],
  ["LAWS0101", 0, true],
  ["MATH1013", 2000, false],
])("%s at %i level is %s", (code, level, expected) => {
  assert.equal(courseMatchesLevel(code, level), expected);
});

test("course filters read as plain wording", () => {
  assert.equal(
    courseFilterLabel({ subjectCodes: ["LAWS"], courseLevels: [1000, 6100] }),
    "LAWS courses at 1000 or 6100 level",
  );
  assert.equal(
    courseFilterLabel(
      { subjectCodes: ["CLAS", "GREK", "HIST"], courseLevels: null },
      true,
    ),
    "CLAS, GREK or HIST course",
  );
});

test("the compact contract accepts the new rule forms and rejects malformed filters", () => {
  assert.deepEqual(issues(LAWS_COUNT), []);
  assert.deepEqual(issues(POOLED_UNITS), []);
  assert.deepEqual(
    issues({ op: "enrolled_in", programmeTitle: "Master of Engineering" }),
    [],
  );
  assert.deepEqual(
    issues({ op: "enrolled_in_career", career: "research", matches: true }),
    [],
  );
  assert.deepEqual(
    issues({
      op: "enrolled_in_structure",
      structureCode: "MATH-HSPC",
      structureKind: "specialisation",
    }),
    [],
  );

  assert.ok(
    issues({ ...LAWS_COUNT, subjectCodes: null, levels: null }).includes(
      "must filter by subjectCodes, levels or both",
    ),
  );
  assert.ok(
    issues({ ...LAWS_COUNT, subjectCodes: [] }).includes(
      "must be null or contain at least one subject",
    ),
  );
  assert.ok(
    issues({ ...LAWS_COUNT, levels: [1000, 1000] }).includes(
      "must not repeat a level",
    ),
  );
  assert.notDeepEqual(issues({ ...LAWS_COUNT, subjectCodes: ["Laws"] }), []);
  assert.notDeepEqual(issues({ ...LAWS_COUNT, minimumCount: 0 }), []);
  assert.notDeepEqual(issues({ ...POOLED_UNITS, minimumUnits: 0 }), []);
  assert.notDeepEqual(
    issues({ ...LAWS_COUNT, includeConcurrent: undefined }),
    [],
  );
  assert.notDeepEqual(
    issues({
      op: "enrolled_in",
      programmeCode: "MENGN",
      programmeTitle: "Master of Engineering",
    }),
    [],
  );
  assert.notDeepEqual(
    issues({ op: "enrolled_in_career", career: "graduate", matches: true }),
    [],
  );
  assert.ok(
    issues({
      op: "enrolled_in_structure",
      structureCode: "MATH-MAJ",
      structureKind: "minor",
    }).includes("must match the kind of MATH-MAJ"),
  );
  assert.notDeepEqual(
    issues({
      op: "enrolled_in_structure",
      structureCode: "MENGN",
      structureKind: "major",
    }),
    [],
  );
});

test("course counts and filtered units project to typed conditions that survive editing", () => {
  const rule = { op: "all_of", rules: [LAWS_COUNT, POOLED_UNITS] };
  const projection = projectCourseSnapshot(modelWith(rule));
  const content = courseCatalogueContent({ projection });
  const [count, units] = content.requirements.conditions;
  assert.equal(count.kind, "course_count");
  assert.equal(count.minimumCount, 5);
  assert.deepEqual(count.subjectCodes, ["LAWS"]);
  assert.deepEqual(count.courseLevels, [1000, 6100]);
  assert.equal(count.requirementMode, "completed_or_concurrent");
  assert.equal(units.kind, "filtered_units");
  assert.equal(units.minimumUnits, 12);
  assert.deepEqual(units.subjectCodes, ["CLAS", "GREK", "HIST", "LATN"]);
  assert.equal(units.courseLevels, null);
  assert.equal(units.requirementMode, "completed");

  const tree = treeFromRequirementWrite(content.requirements, "prerequisite");
  const validated = validateReviewedTree(tree);
  assert.ok("tree" in validated, validated.message);
  const edited = requirementWriteWithTree(
    content.requirements,
    "prerequisite",
    validated.tree,
    LAWS_TEXT,
  );
  const [editedCount, editedUnits] = edited.conditions;
  assert.equal(editedCount.kind, "course_count");
  assert.equal(editedCount.minimumCount, 5);
  assert.equal(editedCount.minimumUnits, null);
  assert.deepEqual(editedCount.courseLevels, [1000, 6100]);
  assert.equal(editedCount.requirementMode, "completed_or_concurrent");
  assert.equal(editedUnits.minimumUnits, 12);
  assert.deepEqual(editedUnits.subjectCodes, ["CLAS", "GREK", "HIST", "LATN"]);

  const published = readProjectionPrerequisiteRule(projection);
  assert.deepEqual(published.relationalExpression.conditions[0], {
    ...published.relationalExpression.conditions[0],
    kind: "course_count",
    subjects: ["LAWS"],
    levels: [1000, 6100],
    minimumCount: 5,
    requirementMode: "completed_or_concurrent",
  });
  assert.equal(
    requirementSliceExpression({
      groups: content.requirements.groups,
      conditions: content.requirements.conditions,
    }).conditions[1].kind,
    "filtered_units",
  );
});

test("career and major enrolment project to career and structure conditions", () => {
  const projection = projectCourseSnapshot(
    modelWith({
      op: "all_of",
      rules: [
        { op: "enrolled_in_career", career: "postgraduate", matches: true },
        {
          op: "enrolled_in_structure",
          structureCode: "MATH-HSPC",
          structureKind: "specialisation",
        },
      ],
    }),
  );
  const [career, structure] = courseCatalogueContent({ projection })
    .requirements.conditions;
  assert.equal(career.kind, "career");
  assert.equal(career.career, "postgraduate");
  assert.equal(career.matchesCareer, true);
  assert.equal("subjectCodes" in career, false);
  assert.equal(structure.kind, "structure");
  assert.equal(structure.itemCode, "MATH-HSPC");
  assert.equal(structure.itemKind, "specialisation");
});

test("a programme title resolves to its unique code, otherwise it stays unchecked wording", () => {
  const title = "Master of Engineering";
  const text = `You must be studying ${title}.`;
  const finalise = (knownProgrammes) =>
    finaliseCourseExtraction({
      code: "ENGN6528",
      year: 2026,
      listingTitle: "Computer vision",
      model: modelWith({ op: "enrolled_in", programmeTitle: title }, text),
      pageMarkdown: text,
      finishReason: "stop",
      responseError: null,
      knownProgrammes,
    });

  const resolved = finalise([
    { code: "MENGN", name: "master of  engineering" },
  ]);
  assert.deepEqual(resolved.extraction.requisites.prerequisiteRule, {
    op: "enrolled_in",
    programmeCode: "MENGN",
  });
  const resolvedCondition = courseCatalogueContent({
    projection: projectCourseSnapshot(resolved.extraction),
  }).requirements.conditions[0];
  assert.equal(resolvedCondition.kind, "structure");
  assert.equal(resolvedCondition.itemCode, "MENGN");
  assert.equal(resolvedCondition.itemKind, "programme");

  for (const knownProgrammes of [
    [],
    [
      { code: "MENGN", name: title },
      { code: "MENGA", name: title },
    ],
  ]) {
    const fallback = finalise(knownProgrammes);
    assert.deepEqual(fallback.extraction.requisites.prerequisiteRule, {
      op: "enrolled_in",
      programmeTitle: title,
    });
    const projection = projectCourseSnapshot(fallback.extraction);
    const condition = courseCatalogueContent({ projection }).requirements
      .conditions[0];
    assert.equal(condition.kind, "structure");
    assert.equal(condition.itemCode, null);
    assert.equal(condition.freeText, title);
    const expression =
      readProjectionPrerequisiteRule(projection).relationalExpression;
    assert.equal(evaluateRule(expression, student()).status, "unknown");
  }
});

test("subjects, levels, structures and titles the page does not print are flagged", () => {
  const finalise = (rule, pageMarkdown) =>
    finaliseCourseExtraction({
      code: "LAWS6249",
      year: 2026,
      listingTitle: "Flexible requisite test",
      model: modelWith(rule, pageMarkdown),
      pageMarkdown,
      finishReason: "stop",
      responseError: null,
    });
  assert.deepEqual(
    finalise(LAWS_COUNT, LAWS_TEXT).report.unprintedRuleValues,
    [],
  );
  const invented = finalise(
    {
      op: "all_of",
      rules: [
        { ...LAWS_COUNT, subjectCodes: ["LAWS", "JURI"], levels: [1000, 2000] },
        {
          op: "enrolled_in_structure",
          structureCode: "LAWS-MAJ",
          structureKind: "major",
        },
        { op: "enrolled_in", programmeTitle: "Juris Doctor" },
      ],
    },
    LAWS_TEXT,
  );
  assert.deepEqual(invented.report.unprintedRuleValues, [
    "JURI",
    "2000 level",
    "LAWS-MAJ",
    "Juris Doctor",
  ]);
  assert.ok(
    invented.extraction.reviewItems.some(
      (item) =>
        item.severity === "error" &&
        item.message.includes("does not print LAWS-MAJ"),
    ),
  );
});

test("course counts include this semester's courses only when concurrency is allowed", () => {
  const condition = {
    kind: "course_count",
    subjects: ["LAWS"],
    levels: [1000, 6100],
    minimumCount: 5,
    requirementMode: "completed_or_concurrent",
    confidence: 1,
    hardness: "hard",
    reviewState: "verified",
    sourceText: LAWS_TEXT,
  };
  const record = student({
    completed: completed(
      "LAWS1201",
      "LAWS1202",
      "LAWS1203",
      "LAWS6101",
      "LAWS6201",
      "MATH1013",
    ),
    enrolled: new Set(["LAWS1204", "LAWS2201"]),
  });
  const result = evaluateCondition(condition, record);
  assert.equal(result.status, "met");
  assert.deepEqual(result.measure, { kind: "count", value: 5, target: 5 });
  assert.equal(
    evaluateCondition({ ...condition, requirementMode: "completed" }, record)
      .status,
    "partial",
  );
  assert.equal(evaluateCondition(condition, student()).status, "unmet");
});

test("filtered units pool subjects and leave unrecorded concurrent units unknown", () => {
  const condition = {
    kind: "filtered_units",
    subjects: ["CLAS", "GREK", "LATN", "HIST"],
    levels: null,
    units: 12,
    requirementMode: "completed_or_concurrent",
    confidence: 1,
    hardness: "hard",
    reviewState: "verified",
    sourceText: "12 units of CLAS, GREK, LATN or HIST courses",
  };
  assert.equal(
    evaluateCondition(
      condition,
      student({ completed: completed("CLAS1001", "GREK2002", "ENGL1001") }),
    ).status,
    "met",
  );
  assert.deepEqual(
    evaluateCondition(
      condition,
      student({ completed: completed("HIST1001", "ENGL1001") }),
    ).measure,
    { kind: "units", value: 6, target: 12 },
  );
  const enrolled = student({
    completed: completed("HIST1001"),
    enrolled: new Set(["LATN1001"]),
  });
  assert.equal(evaluateCondition(condition, enrolled).status, "unknown");
  assert.equal(
    evaluateCondition(condition, {
      ...enrolled,
      enrolledUnits: new Map([["LATN1001", 6]]),
    }).status,
    "met",
  );
  assert.equal(
    evaluateCondition(
      { ...condition, requirementMode: "completed", levels: [2000] },
      student({ completed: completed("HIST1001", "HIST2001", "CLAS2001") }),
    ).status,
    "met",
  );
});

test.each([
  ["postgraduate", true, ["MPOL"], "met"],
  ["postgraduate", true, ["PHD"], "met"],
  ["research", true, ["MPOL"], "unmet"],
  ["undergraduate", false, ["MPOL"], "met"],
  ["postgraduate", false, ["MPOL"], "unmet"],
  ["postgraduate", true, ["BARTS", "MPOL"], "met"],
  ["postgraduate", true, ["UNLISTED"], "unknown"],
  ["postgraduate", true, ["UNLISTED", "MPOL"], "met"],
  ["postgraduate", false, ["UNLISTED", "BARTS"], "unknown"],
  ["postgraduate", true, [], "unknown"],
])(
  "%s career with matches %s for %j is %s",
  (career, matches, codes, expected) => {
    const careers = [
      { code: "MPOL", career: "postgraduate" },
      { code: "PHD", career: "research" },
      { code: "BARTS", career: "undergraduate" },
      { code: "UNLISTED", career: null },
    ];
    assert.equal(
      careerEnrolmentStatus(career, matches, codes, careers),
      expected,
    );
    assert.equal(
      evaluateCondition(
        {
          kind: "career",
          career,
          matchesCareer: matches,
          confidence: 1,
          hardness: "hard",
          reviewState: "verified",
          sourceText: "",
        },
        student({ programmeCodes: codes, programmeCareers: careers }),
      ).status,
      expected,
    );
  },
);

test("a major, minor or specialisation is checked against the plan's structures", () => {
  const condition = {
    kind: "structure",
    structureCode: "MATH-HSPC",
    text: null,
    confidence: 1,
    hardness: "hard",
    reviewState: "verified",
    sourceText: "",
  };
  assert.equal(
    evaluateCondition(condition, student({ structureCodes: ["MATH-HSPC"] }))
      .status,
    "met",
  );
  assert.equal(
    evaluateCondition(condition, student({ structureCodes: ["MATH-MAJ"] }))
      .status,
    "unmet",
  );
  assert.equal(
    evaluateCondition(condition, student({ programmeCodes: ["MATH-HSPC"] }))
      .status,
    "unknown",
  );
});

test("the planner counts a same-term course towards a concurrent course count", () => {
  const prerequisiteRule = readProjectionPrerequisiteRule(
    projectCourseSnapshot(
      modelWith({ ...LAWS_COUNT, minimumCount: 2, levels: [1000] }),
    ),
  );
  prerequisiteRule.reviewState = "verified";
  prerequisiteRule.relationalExpression.reviewState = "verified";
  for (const condition of prerequisiteRule.relationalExpression.conditions)
    condition.reviewState = "verified";
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
  const courses = [
    { code: "LAWS6249", year: 2026, units: 6, prerequisiteRule },
    { code: "LAWS1201", year: 2026, units: 6 },
    { code: "LAWS1202", year: 2026, units: 6 },
  ];
  const target = {
    id: "target",
    courseCode: "LAWS6249",
    academicYear: 2026,
    termId: "2026-s2",
    status: "planned",
  };
  const earlier = {
    id: "earlier",
    courseCode: "LAWS1201",
    academicYear: 2026,
    termId: "2026-s1",
    status: "completed",
  };
  const sameTerm = {
    id: "same",
    courseCode: "LAWS1202",
    academicYear: 2026,
    termId: "2026-s2",
    status: "planned",
  };
  assert.equal(
    evaluateCoursePrerequisites(target, [earlier, sameTerm], { courses, terms })
      .state,
    "satisfied",
  );
  assert.equal(
    evaluateCoursePrerequisites(target, [earlier], { courses, terms }).state,
    "unsatisfied",
  );
});

test("sample students satisfy course counts, filtered units and careers", () => {
  const rule = readProjectionPrerequisiteRule(
    projectCourseSnapshot(
      modelWith({
        op: "all_of",
        rules: [
          LAWS_COUNT,
          { ...POOLED_UNITS, levels: [2000] },
          { op: "enrolled_in_career", career: "postgraduate", matches: false },
        ],
      }),
    ),
  ).relationalExpression;
  assert.equal(
    evaluateRule(rule, sampleStudent(rule, "complete")).status,
    "met",
  );
  assert.notEqual(evaluateRule(rule, sampleStudent(rule, "new")).status, "met");
});

test.each([
  [
    { ...LAWS_COUNT },
    "Complete 5 LAWS courses at 1000 or 6100 level (or be enrolled in them)",
  ],
  [
    { ...POOLED_UNITS },
    "Complete 12 units of CLAS, GREK, HIST or LATN courses",
  ],
  [
    { op: "enrolled_in_career", career: "postgraduate", matches: true },
    "Be enrolled in a postgraduate program",
  ],
  [
    { op: "enrolled_in_career", career: "non_award", matches: false },
    "Not be enrolled in non-award study",
  ],
  [
    {
      op: "enrolled_in_structure",
      structureCode: "VAPR-MIN",
      structureKind: "minor",
    },
    "Be enrolled in the VAPR-MIN minor",
  ],
  [
    { op: "enrolled_in", programmeTitle: "Master of Engineering" },
    "Be enrolled in Master of Engineering",
  ],
])("%j reads as %s", (rule, expected) => {
  const expression = readProjectionPrerequisiteRule(
    projectCourseSnapshot(modelWith(rule)),
  ).relationalExpression;
  assert.equal(requisiteSentence(expression.conditions[0]), expected);
});
