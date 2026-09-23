import assert from "node:assert/strict";
import { test } from "vitest";

import { emptyCatalogueContent } from "../lib/catalogue/content.ts";
import type { CatalogueContent } from "../lib/catalogue/content.ts";
import {
  applyReviewUnits,
  catalogueReviewUnitMap,
} from "../lib/catalogue/review-units.ts";
import {
  classifySourceChange,
  classifySourceReview,
  reclassifyAgainstDraft,
  reviewValueHash,
} from "../lib/catalogue/source-review.ts";

function course(description: string | null, title = "Review Course") {
  const content = emptyCatalogueContent({
    kind: "course",
    code: "COMP2700",
    academicYear: 2027,
    title,
  }) as Extract<CatalogueContent, { kind: "course" }>;
  content.course.details.description = description;
  return content;
}

function classificationFor(
  base: string | null,
  local: string | null,
  incoming: string | null,
) {
  return classifySourceChange({
    hasBaseSource: true,
    baseSourceValue: base,
    localValue: local,
    incomingSourceValue: incoming,
  });
}

test("the three-way truth table distinguishes a conflict from a change", () => {
  assert.equal(classificationFor("A", "A", "A"), null);
  assert.equal(classificationFor("A", "B", "A"), "local_override");
  assert.equal(classificationFor("A", "A", "C"), "source_change");
  assert.equal(classificationFor("A", "B", "C"), "conflict");
  assert.equal(classificationFor("A", "C", "C"), "converged");
});

test("a first comparison treats authored content as an independent author", () => {
  const withoutBase = (local: string | null, incoming: string | null) =>
    classifySourceChange({
      hasBaseSource: false,
      baseSourceValue: null,
      localValue: local,
      incomingSourceValue: incoming,
    });
  assert.equal(withoutBase("Locally authored", "ANU wording"), "conflict");
  assert.equal(withoutBase("Same wording", "Same wording"), "converged");
  assert.equal(withoutBase(null, "ANU wording"), "source_change");
  assert.equal(withoutBase("   ", "ANU wording"), "source_change");
});

test("only units that moved produce review rows", () => {
  const changes = classifySourceReview({
    baseSource: course("Previous ANU"),
    local: course("Local wording"),
    incomingSource: course("New ANU"),
  });
  assert.deepEqual(
    changes.map((change) => [change.fieldPath, change.classification]),
    [["course.details.description", "conflict"]],
  );
  assert.equal(changes[0]!.unitKind, "scalar");
  assert.equal(changes[0]!.baseSourceValue, "Previous ANU");
  assert.equal(changes[0]!.localValue, "Local wording");
  assert.equal(changes[0]!.incomingSourceValue, "New ANU");

  assert.deepEqual(
    classifySourceReview({
      baseSource: course("Same"),
      local: course("Same"),
      incomingSource: course("Same"),
    }),
    [],
  );
});

test("keeping a value against an unchanged source stops asking", () => {
  const kept = classifySourceReview({
    baseSource: course("A"),
    local: course("B"),
    incomingSource: course("C"),
  });
  assert.equal(kept[0]!.classification, "conflict");

  // ANU still says C on the next sync, so the baseline has advanced to C.
  const repeated = classifySourceReview({
    baseSource: course("C"),
    local: course("B"),
    incomingSource: course("C"),
  });
  assert.equal(repeated[0]!.classification, "local_override");

  const moved = classifySourceReview({
    baseSource: course("C"),
    local: course("B"),
    incomingSource: course("D"),
  });
  assert.equal(moved[0]!.classification, "conflict");
});

test("a later edit to the same path reclassifies the stored row", () => {
  const stored = {
    classification: "source_change" as const,
    baseSourceValue: "A",
    localValue: "A",
    incomingSourceValue: "C",
    localValueHash: reviewValueHash("A"),
  };
  assert.deepEqual(reclassifyAgainstDraft(stored, "A"), {
    classification: "source_change",
    localValue: "A",
    isStale: false,
  });
  assert.deepEqual(reclassifyAgainstDraft(stored, "B"), {
    classification: "conflict",
    localValue: "B",
    isStale: true,
  });
  assert.deepEqual(reclassifyAgainstDraft(stored, "C"), {
    classification: "converged",
    localValue: "C",
    isStale: true,
  });
});

test("applying one unit leaves every other path and its evidence alone", () => {
  const draft = course("Local description", "Local title");
  draft.evidence = [
    {
      fieldPath: "title",
      method: "manual",
      confidence: null,
      sourceLocator: null,
      sourceExcerpt: null,
    },
  ];
  const incoming = course("ANU description", "ANU title");
  incoming.evidence = [
    {
      fieldPath: "description",
      method: "model",
      confidence: 0.9,
      sourceLocator: "#description",
      sourceExcerpt: "ANU description",
    },
    {
      fieldPath: "title",
      method: "model",
      confidence: 1,
      sourceLocator: "#title",
      sourceExcerpt: "ANU title",
    },
  ];

  const applied = applyReviewUnits(
    draft,
    incoming,
    new Set(["course.details.description"]),
  );
  const units = catalogueReviewUnitMap(applied);
  assert.equal(
    units.get("course.details.description")?.value,
    "ANU description",
  );
  assert.equal(units.get("course.details.title")?.value, "Local title");
  assert.deepEqual(
    applied.evidence.map((entry) => [entry.fieldPath, entry.method]),
    [
      ["title", "manual"],
      ["description", "model"],
    ],
  );
});

test("a requirement rule reviews on its own", () => {
  const local = course("Description");
  local.requirements = {
    rules: [
      {
        key: "prerequisite",
        hardness: "hard",
        sourceText: "COMP1100 or COMP1130",
        sourceLocator: null,
        reviewState: "verified",
        confidence: 1,
        position: 0,
      },
      {
        key: "incompatibility",
        hardness: "hard",
        sourceText: "COMP1110",
        sourceLocator: null,
        reviewState: "verified",
        confidence: 1,
        position: 1,
      },
    ],
    groups: [],
    conditions: [],
    options: [],
    references: [],
  };
  const incoming = structuredClone(local);
  incoming.requirements.rules[0]!.sourceText = "COMP1130";

  const changes = classifySourceReview({
    baseSource: null,
    local,
    incomingSource: incoming,
  });
  assert.deepEqual(
    changes
      .filter((change) => change.classification !== "converged")
      .map((change) => [change.fieldPath, change.classification]),
    [["requirements.prerequisite", "conflict"]],
  );
});
