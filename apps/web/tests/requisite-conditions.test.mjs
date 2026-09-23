import assert from "node:assert/strict";

import { test } from "vitest";

const {
  addChild,
  applyCourseMatch,
  conditionSourceText,
  conditionSummary,
  courseMatch,
  createConditionNode,
  createEmptyTree,
  createGroupNode,
  deleteFromTree,
  groupSentence,
  isEmptyReviewedTree,
  isImporterOwnedRule,
  moveInTree,
  reviewedTreeFromStored,
  validateReviewedTree,
} = await import("../lib/coursemap/requisite-conditions.ts");

test("preserves completed-or-concurrent course requirements in the editor", () => {
  const concurrent = applyCourseMatch(
    {
      type: "condition",
      id: "course-condition",
      kind: "course",
      courseCode: "COMP1100",
    },
    "concurrent",
  );

  assert.equal(courseMatch(concurrent), "concurrent");
  assert.equal(concurrent.courseRequirementMode, "completed_or_concurrent");
  assert.match(conditionSourceText(concurrent), /concurrently/u);
});

const importerStructured = {
  confidence: 1,
  reviewState: "automatic",
  sourceText: "To enrol in this course you must have completed STAT6045.",
  groups: [
    {
      id: 1,
      parentId: null,
      operator: "all_of",
      minimumCount: null,
      position: 0,
    },
  ],
  conditions: [
    {
      id: 11,
      groupId: 1,
      kind: "course",
      courseCode: "STAT6045",
      courseTitle: null,
      structureCode: null,
      structureName: null,
      units: null,
      subjectCode: null,
      level: null,
      gpa: null,
      mark: null,
      freeText: null,
      sourceText: "STAT6045",
      confidence: 1,
      reviewState: "automatic",
      position: 0,
    },
  ],
};

test("treats the importer structured tree as automatic, not reviewed", () => {
  assert.equal(isImporterOwnedRule(importerStructured), true);
  assert.equal(reviewedTreeFromStored(importerStructured), null);
});

test("treats a raw other-condition tree as automatic, not reviewed", () => {
  const raw = {
    confidence: 0,
    reviewState: "review",
    sourceText: "Permission of the convener is required.",
    groups: [
      {
        id: 4,
        parentId: null,
        operator: "all_of",
        minimumCount: null,
        position: 0,
      },
    ],
    conditions: [
      {
        id: 41,
        groupId: 4,
        kind: "other",
        courseCode: null,
        courseTitle: null,
        structureCode: null,
        structureName: null,
        units: null,
        subjectCode: null,
        level: null,
        gpa: null,
        mark: null,
        freeText: "Permission of the convener is required.",
        sourceText: "Permission of the convener is required.",
        confidence: 0,
        reviewState: "review",
        position: 0,
      },
    ],
  };
  assert.equal(isImporterOwnedRule(raw), true);
  assert.equal(reviewedTreeFromStored(raw), null);
});

test("reads a human-owned tree as reviewed conditions", () => {
  const reviewed = {
    ...importerStructured,
    confidence: 1,
    reviewState: "review",
    conditions: [
      {
        ...importerStructured.conditions[0],
        kind: "gpa",
        courseCode: null,
        gpa: 5,
        sourceText: "GPA of at least 5",
        reviewState: "review",
      },
    ],
  };
  assert.equal(isImporterOwnedRule(reviewed), false);
  assert.deepEqual(reviewedTreeFromStored(reviewed), {
    type: "group",
    id: "group-1",
    operator: "all_of",
    minimumCount: null,
    children: [{ type: "condition", id: "condition-11", kind: "gpa", gpa: 5 }],
  });
});

test("rebuilds nested any-of groups from stored rows", () => {
  const nested = reviewedTreeFromStored({
    confidence: 1,
    reviewState: "review",
    sourceText: "STAT6045 or (COMP1100 and a GPA of 5).",
    groups: [
      {
        id: 1,
        parentId: null,
        operator: "any_of",
        minimumCount: null,
        position: 0,
      },
      {
        id: 2,
        parentId: 1,
        operator: "all_of",
        minimumCount: null,
        position: 1,
      },
    ],
    conditions: [
      {
        ...importerStructured.conditions[0],
        id: 21,
        groupId: 1,
        position: 0,
      },
      {
        ...importerStructured.conditions[0],
        id: 22,
        groupId: 2,
        courseCode: "COMP1100",
        sourceText: "COMP1100",
        position: 0,
        reviewState: "review",
      },
      {
        ...importerStructured.conditions[0],
        id: 23,
        groupId: 2,
        kind: "gpa",
        courseCode: null,
        gpa: 5,
        sourceText: "GPA of at least 5",
        position: 1,
        reviewState: "review",
      },
    ],
  });
  assert.deepEqual(nested, {
    type: "group",
    id: "group-1",
    operator: "any_of",
    minimumCount: null,
    children: [
      {
        type: "condition",
        id: "condition-21",
        kind: "course",
        courseCode: "STAT6045",
        courseTitle: null,
        mark: null,
      },
      {
        type: "group",
        id: "group-2",
        operator: "all_of",
        minimumCount: null,
        children: [
          {
            type: "condition",
            id: "condition-22",
            kind: "course",
            courseCode: "COMP1100",
            courseTitle: null,
            mark: null,
          },
          {
            type: "condition",
            id: "condition-23",
            kind: "gpa",
            gpa: 5,
          },
        ],
      },
    ],
  });
});

test("an empty reviewed tree validates as empty", () => {
  const empty = validateReviewedTree({
    operator: "all_of",
    conditions: [],
  });
  assert.deepEqual(empty, {
    tree: {
      type: "group",
      id: "root",
      operator: "all_of",
      minimumCount: null,
      children: [],
    },
  });
  assert.equal(isEmptyReviewedTree(empty.tree), true);
});

test("rejects an out-of-range GPA and accepts a 7-point value", () => {
  assert.deepEqual(
    validateReviewedTree({
      operator: "all_of",
      conditions: [{ kind: "gpa", gpa: 8 }],
    }),
    { message: "Condition 1: GPA must be between 0 and 7." },
  );
  assert.deepEqual(
    validateReviewedTree({
      id: "root",
      operator: "all_of",
      children: [{ type: "condition", id: "gpa-1", kind: "gpa", gpa: 5.5 }],
    }),
    {
      tree: {
        type: "group",
        id: "root",
        operator: "all_of",
        minimumCount: null,
        children: [{ type: "condition", id: "gpa-1", kind: "gpa", gpa: 5.5 }],
      },
    },
  );
});

test("does not turn a cleared WAM into a zero requirement", () => {
  assert.deepEqual(
    validateReviewedTree({
      id: "root",
      operator: "all_of",
      children: [{ type: "condition", id: "wam", kind: "wam", wam: null }],
    }),
    { message: "Condition 1: WAM must be between 0 and 100." },
  );
});

test("describes completed-or-concurrent course requirements accurately", () => {
  assert.equal(
    conditionSummary({
      kind: "course",
      courseCode: "COMP1100",
      courseRequirementMode: "completed_or_concurrent",
    }),
    "Completed or concurrently enrolled in COMP1100",
  );
});

test("validates every advanced snapshot-native condition without flattening", () => {
  const result = validateReviewedTree({
    id: "root",
    operator: "all_of",
    children: [
      {
        type: "condition",
        id: "course-set",
        kind: "course_set_units",
        units: 6,
        courseCodes: ["COMP1100", "COMP1110"],
      },
      {
        type: "condition",
        id: "standing",
        kind: "year_standing",
        minimumYear: 2,
      },
      { type: "condition", id: "wam", kind: "wam", wam: 65 },
    ],
  });

  assert.deepEqual(result, {
    tree: {
      type: "group",
      id: "root",
      operator: "all_of",
      minimumCount: null,
      children: [
        {
          type: "condition",
          id: "course-set",
          kind: "course_set_units",
          units: 6,
          courseCodes: ["COMP1100", "COMP1110"],
        },
        {
          type: "condition",
          id: "standing",
          kind: "year_standing",
          minimumYear: 2,
        },
        { type: "condition", id: "wam", kind: "wam", wam: 65 },
      ],
    },
  });
});

test("requires at least N to stay within the child count", () => {
  assert.deepEqual(
    validateReviewedTree({
      operator: "at_least",
      minimumCount: 3,
      conditions: [
        { kind: "course", courseCode: "STAT6045" },
        { kind: "course", courseCode: "STAT6038" },
      ],
    }),
    { message: "Choose how many of the 2 items must match." },
  );
});

test("accepts nested any-of inside all-of", () => {
  const result = validateReviewedTree({
    id: "root",
    operator: "all_of",
    children: [
      { type: "condition", id: "a", kind: "course", courseCode: "STAT6045" },
      {
        type: "group",
        id: "inner",
        operator: "any_of",
        children: [
          {
            type: "condition",
            id: "b",
            kind: "course",
            courseCode: "COMP1100",
          },
          { type: "condition", id: "c", kind: "gpa", gpa: 5 },
        ],
      },
    ],
  });
  assert.equal("tree" in result, true);
  if (!("tree" in result)) return;
  assert.equal(result.tree.children.length, 2);
  assert.equal(result.tree.children[1].type, "group");
});

test("moves a condition under another group and refuses cycles", () => {
  const root = createEmptyTree("root");
  const inner = {
    type: "group",
    id: "inner",
    operator: "any_of",
    minimumCount: null,
    children: [],
  };
  const withInner = addChild(root, "root", inner);
  const withLeaf = addChild(withInner, "root", createConditionNode("gpa"));
  const leaf = withLeaf.children.find((child) => child.type === "condition");
  assert.ok(leaf);
  const moved = moveInTree(withLeaf, leaf.id, "inner");
  assert.equal(moved.children.length, 1);
  assert.equal(moved.children[0].id, "inner");
  assert.equal(moved.children[0].type, "group");
  if (moved.children[0].type !== "group") return;
  assert.equal(moved.children[0].children[0].id, leaf.id);
  assert.deepEqual(moveInTree(moved, "root", "inner"), moved);
});

test("moving the last condition out removes its empty group", () => {
  const condition = {
    ...createConditionNode("course"),
    courseCode: "COMP1600",
  };
  const root = {
    type: "group",
    id: "root",
    operator: "all_of",
    minimumCount: null,
    children: [
      {
        type: "group",
        id: "inner",
        operator: "any_of",
        minimumCount: null,
        children: [condition],
      },
    ],
  };

  const moved = moveInTree(root, condition.id, "root", 1);
  assert.deepEqual(
    moved.children.map((child) => child.id),
    [condition.id],
  );
});

test("nested groups read as a sentence instead of a join chip", () => {
  assert.equal(
    groupSentence({ operator: "all_of", minimumCount: null }),
    "All of the following are true",
  );
  assert.equal(
    groupSentence({ operator: "any_of", minimumCount: null }),
    "Any of the following are true",
  );
  assert.equal(
    groupSentence({ operator: "at_least", minimumCount: 2 }),
    "At least 2 of the following are true",
  );
});

test("deleting the last nested condition removes the empty group", () => {
  const root = createEmptyTree("root");
  const nested = addChild(root, "root", createGroupNode("any_of"));
  const group = nested.children[0];
  assert.equal(group.type, "group");
  if (group.type !== "group") return;
  const leaf = group.children[0];
  const next = deleteFromTree(nested, leaf.id);
  assert.equal(next.children.length, 0);
});
