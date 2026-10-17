import assert from "node:assert/strict";
import { test } from "vitest";
import { emptyCourseExtraction } from "../lib/catalogue-import/kinds/course/finalise.ts";
import { projectCourseSnapshot } from "../lib/catalogue-import/kinds/course/project.ts";
import {
  REQUISITE_FALLBACK_CODE,
  REQUISITE_FALLBACK_MESSAGE,
  requisiteFallbackContent,
} from "../lib/catalogue-import/requisite-fallback.ts";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content.ts";
import { diffSnapshotWrites } from "../lib/catalogue-import/changes.ts";
import {
  courseCatalogueContent,
  validateCatalogueContent,
} from "../lib/catalogue/content.ts";
import { requirementSliceExpression } from "../lib/catalogue/requirement-expression.ts";
import {
  evaluateRule,
  isSoftExpression,
} from "../lib/coursemap/requisite-evaluation.ts";
import {
  softRequirementLabel,
  splitRequisiteRule,
} from "../ui/courses/requisite-wording.ts";
import { applyRequisiteFallback } from "../scripts/catalogue/lib/agent-publication.mjs";

const UNMODELLED =
  "Students who have failed a course in the previous semester require the convener's approval.";
const OTHER_INFORMATION =
  "Students must attend an interview with the course convener before enrolling.";
const TEXT = `To enrol in this course you must have completed SOCY1002. ${UNMODELLED}`;

function contentFor(rule, { unmodelled = [], flags = [], text = TEXT } = {}) {
  const model = emptyCourseExtraction({
    code: "SOCY2001",
    year: 2026,
    title: "Sociology",
  });
  model.requisites.prerequisiteText = text;
  model.requisites.prerequisiteRule = rule;
  model.requisites.unmodelledText = unmodelled;
  const content = courseCatalogueContent({
    projection: projectCourseSnapshot(model),
    flags,
  });
  content.contentHash = contentHashForCatalogueContent(content);
  return content;
}

const unmodelledFlag = {
  fieldPath: "requisites.unmodelledText",
  severity: "error",
  code: "UNSUPPORTED",
  message: `The importer could not model this requirement: ${UNMODELLED}`,
  sourceExcerpt: null,
};
const otherInformationFlag = {
  fieldPath: "requisites",
  severity: "error",
  code: "UNSUPPORTED",
  message:
    "The other information section includes eligibility wording that needs review.",
  sourceExcerpt: OTHER_INFORMATION,
};

function expressionOf(content) {
  const { groups, conditions, options } = content.requirements;
  return requirementSliceExpression({
    groups: groups.filter((group) => group.ruleKey === "prerequisite"),
    conditions: conditions.filter(
      (condition) => condition.ruleKey === "prerequisite",
    ),
    options,
  });
}

const student = (codes = []) => ({
  completed: new Map(codes.map((code) => [code, { units: 6, mark: null }])),
  enrolled: new Set(),
  programmeCodes: [],
  wam: null,
  gpa: null,
  studyYear: null,
});

test("the fallback keeps the modelled rule and adds ANU's leftovers as notes", () => {
  const draft = contentFor(
    { op: "completed", courseCode: "SOCY1002" },
    {
      unmodelled: [UNMODELLED],
      flags: [
        unmodelledFlag,
        otherInformationFlag,
        {
          fieldPath: "description",
          severity: "warning",
          code: "MISSING",
          message: "The introduction layout needs review.",
          sourceExcerpt: null,
        },
      ],
    },
  );
  const before = structuredClone(draft);
  const result = requisiteFallbackContent(draft);
  assert.ok(!("refused" in result), result.refused);
  // The input is left alone.
  assert.deepEqual(draft, before);

  const { content } = result;
  assert.deepEqual(result.notes, [UNMODELLED, OTHER_INFORMATION]);
  assert.equal(result.downgraded, 2);
  assert.equal(result.softened, false);
  const conditions = content.requirements.conditions.filter(
    (condition) => condition.ruleKey === "prerequisite",
  );
  assert.deepEqual(
    conditions.map((condition) => [
      condition.kind,
      condition.itemCode,
      condition.hardness,
      condition.noteKind ?? null,
      condition.freeText,
    ]),
    [
      ["course", "SOCY1002", "hard", null, null],
      ["other", null, "advisory", "check_with_anu", UNMODELLED],
      ["other", null, "advisory", "check_with_anu", OTHER_INFORMATION],
    ],
  );
  assert.deepEqual(
    content.flags.map((flag) => [flag.severity, flag.code]),
    [
      ["warning", REQUISITE_FALLBACK_CODE],
      ["warning", REQUISITE_FALLBACK_CODE],
      ["warning", "MISSING"],
    ],
  );
  assert.ok(content.flags[0].message.startsWith(REQUISITE_FALLBACK_MESSAGE));
  assert.ok(content.flags[0].message.endsWith(unmodelledFlag.message));

  // The content hash is recomputed and the result is valid content.
  assert.notEqual(content.contentHash, draft.contentHash);
  assert.equal(content.contentHash, contentHashForCatalogueContent(content));
  validateCatalogueContent(content);
  assert.ok(diffSnapshotWrites(draft, content).length > 0);

  // The modelled course still decides; the notes never do.
  const expression = expressionOf(content);
  assert.equal(evaluateRule(expression, student()).status, "unmet");
  assert.equal(evaluateRule(expression, student(["SOCY1002"])).status, "met");
  const split = splitRequisiteRule(expression);
  assert.deepEqual(split.soft.map(softRequirementLabel), [
    "Check with ANU",
    "Check with ANU",
  ]);
});

test("a choice gains an all-of root so its notes are not alternatives", () => {
  const draft = contentFor(
    {
      op: "one_of",
      rules: [
        { op: "completed", courseCode: "SOCY1002" },
        { op: "completed", courseCode: "SOCY1004" },
      ],
    },
    { flags: [otherInformationFlag] },
  );
  const { content } = requisiteFallbackContent(draft);
  const groups = content.requirements.groups.filter(
    (group) => group.ruleKey === "prerequisite",
  );
  assert.deepEqual(
    groups.map((group) => [group.key, group.parentKey, group.operator]),
    [
      ["prerequisite:group:fallback", null, "all_of"],
      ["prerequisite:group:root", "prerequisite:group:fallback", "any_of"],
    ],
  );
  const expression = expressionOf(content);
  assert.equal(expression.operator, "all_of");
  assert.equal(evaluateRule(expression, student()).status, "unmet");
  assert.equal(evaluateRule(expression, student(["SOCY1004"])).status, "met");
});

test("with no modelled rule the fallback publishes notes only", () => {
  const draft = contentFor(null, {
    unmodelled: [UNMODELLED],
    flags: [unmodelledFlag],
    text: `To enrol in this course you must have completed SOCY1002 and SOCY1003 or SOCY1004.\n\n${UNMODELLED}`,
  });
  const { content, notes } = requisiteFallbackContent(draft);
  // The whole stored wording is one note; the unmodelled clause inside it is
  // not shown a second time.
  assert.deepEqual(notes, [
    `To enrol in this course you must have completed SOCY1002 and SOCY1003 or SOCY1004. ${UNMODELLED}`,
  ]);
  // Every condition is a note, so nothing blocks a plan.
  assert.ok(isSoftExpression(expressionOf(content)));
  assert.equal(
    content.requirements.conditions.every(
      (condition) =>
        condition.ruleKey !== "prerequisite" ||
        condition.noteKind === "check_with_anu",
    ),
    true,
  );
  assert.equal(
    new Set(
      content.requirements.conditions.map(
        (condition) => `${condition.groupKey}:${condition.position}`,
      ),
    ).size,
    content.requirements.conditions.length,
  );
});

test("a rule the flags doubt is kept soft with ANU's whole wording", () => {
  const text =
    "To enrol in this course you must have completed SOCY1002 and SOCY1003 or SOCY1004.";
  const draft = contentFor(
    {
      op: "all_of",
      rules: [
        { op: "completed", courseCode: "SOCY1002" },
        {
          op: "one_of",
          rules: [
            { op: "completed", courseCode: "SOCY1003" },
            { op: "completed", courseCode: "SOCY1004" },
          ],
        },
      ],
    },
    {
      text,
      flags: [
        {
          fieldPath: "requisites.prerequisiteRule",
          severity: "error",
          code: "AMBIGUOUS",
          message:
            "The ANU prerequisite joins course codes with both 'and' and 'or' without grouping them. Confirm the intended alternatives before publishing.",
          sourceExcerpt: null,
        },
      ],
    },
  );
  const result = requisiteFallbackContent(draft);
  assert.equal(result.softened, true);
  assert.deepEqual(result.notes, [text]);
  assert.ok(
    result.content.requirements.conditions.every(
      (condition) => condition.hardness === "advisory",
    ),
  );
  assert.equal(
    evaluateRule(expressionOf(result.content), student()).status,
    "unmet",
  );
  // Unmet only for display: a wholly soft rule never blocks a plan.
  assert.ok(
    splitRequisiteRule(expressionOf(result.content)).requirements.length === 0,
  );
});

test("the fallback refuses drafts with other errors or none", () => {
  assert.match(
    requisiteFallbackContent(
      contentFor(
        { op: "completed", courseCode: "SOCY1002" },
        {
          flags: [
            otherInformationFlag,
            {
              fieldPath: "unitValue",
              severity: "error",
              code: "INVALID",
              message: "The model's unitValue did not fit the course contract.",
              sourceExcerpt: null,
            },
          ],
        },
      ),
    ).refused,
    /outside its requisites/u,
  );
  assert.match(
    requisiteFallbackContent(
      contentFor({ op: "completed", courseCode: "SOCY1002" }),
    ).refused,
    /no errors/u,
  );
});

/** A stand-in for postgres.js that answers the draft read and records writes. */
function fakeSql(row) {
  const statements = [];
  const tx = (strings, ...values) => {
    const text = strings.join("?");
    statements.push({ text, values });
    if (text.includes("select drafts.content")) return Promise.resolve([row]);
    if (text.includes("insert into public.catalogue_change_events"))
      return Promise.resolve([{ id: 7 }]);
    return Promise.resolve([]);
  };
  tx.json = (value) => value;
  return { sql: { begin: (work) => work(tx) }, statements };
}

const fallbackOptions = {
  recordId: 1,
  userId: "00000000-0000-4000-8000-000000000001",
  requisiteFallbackContent,
  validateCatalogueContent,
  diffSnapshotWrites,
};

test("applying the fallback refuses a draft an administrator edited", async () => {
  const draft = contentFor(
    { op: "completed", courseCode: "SOCY1002" },
    { flags: [otherInformationFlag] },
  );
  const edited = fakeSql({
    content: draft,
    revision: 3,
    updated_by: "00000000-0000-4000-8000-000000000002",
    base_version_id: 9,
    latest_source_version_id: 9,
  });
  await assert.rejects(
    applyRequisiteFallback(edited.sql, fallbackOptions),
    /edited/u,
  );
  assert.equal(
    edited.statements.some((statement) =>
      statement.text.includes("update public.catalogue_drafts"),
    ),
    false,
  );

  const untouched = fakeSql({
    content: draft,
    revision: 3,
    updated_by: null,
    base_version_id: 9,
    latest_source_version_id: 9,
  });
  const result = await applyRequisiteFallback(untouched.sql, fallbackOptions);
  assert.equal(result.revision, 4);
  assert.deepEqual(result.notes, [OTHER_INFORMATION]);
  const update = untouched.statements.find((statement) =>
    statement.text.includes("update public.catalogue_drafts"),
  );
  const [written, hash] = update.values;
  assert.equal(hash, contentHashForCatalogueContent(written));
  assert.equal(
    written.flags.some((flag) => flag.severity === "error"),
    false,
  );
});

test("does not repeat wording the answer already shows across several notes", () => {
  const first =
    "- Provisional Registration with the Psychology Board of Australia,";
  const second =
    "- National Police Certificate - Students must complete a National Police Check.";
  const content = contentFor(
    {
      op: "all_of",
      rules: [
        { op: "completed", courseCode: "SOCY1002" },
        { op: "note", sourceText: first, required: true },
        { op: "note", sourceText: second, required: true },
      ],
    },
    {
      flags: [
        {
          ...otherInformationFlag,
          sourceExcerpt: `${first} ${second}`,
        },
      ],
    },
  );
  const result = requisiteFallbackContent(content);
  assert.ok(!("refused" in result));
  assert.deepEqual(result.notes, []);
  assert.equal(result.downgraded, 1);
});

test("shows a quoted bullet as a standalone sentence", async () => {
  const { standaloneWording } =
    await import("../ui/courses/requisite-wording.ts");
  assert.equal(
    standaloneWording(
      "- Provisional Registration with the Psychology Board of Australia,",
    ),
    "Provisional Registration with the Psychology Board of Australia",
  );
  assert.equal(
    standaloneWording("Students must attend."),
    "Students must attend.",
  );
});
