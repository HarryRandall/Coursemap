import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const { buildAcademicStructureRequirementTree } =
  await import("../lib/coursemap/plan-catalogue.ts");

function group(overrides) {
  return {
    description: null,
    group_key: "requirements:root",
    id: 1,
    label: null,
    maximum_units: null,
    minimum_count: null,
    minimum_units: null,
    operator: "all_of",
    parent_group_id: null,
    position: 1,
    rule_id: 5,
    snapshot_id: 70,
    source_locator: "#program-requirements",
    source_text: "Complete all of the following requirements.",
    ...overrides,
  };
}

function condition(overrides) {
  return {
    condition_key: "requirements:units",
    condition_kind: "units_total",
    confidence: 1,
    free_text: null,
    group_id: 1,
    hardness: "hard",
    id: 10,
    item_id: null,
    maximum_level: null,
    maximum_units: null,
    minimum_count: null,
    minimum_gpa: null,
    minimum_level: null,
    minimum_mark: null,
    minimum_units: 144,
    minimum_wam: null,
    minimum_year: null,
    position: 1,
    requirement_mode: null,
    review_state: "verified",
    rule_id: 5,
    snapshot_id: 70,
    source_locator: "#program-requirements",
    source_text: "144 units",
    structure_kind: null,
    subject_code: null,
    tag: null,
    ...overrides,
  };
}

test("rebuilds nested requirement groups with ordered alternatives and options", () => {
  const tree = buildAcademicStructureRequirementTree({
    groups: [
      group({}),
      group({
        group_key: "requirements:choice",
        id: 2,
        operator: "any_of",
        parent_group_id: 1,
        position: 2,
        source_text: "Complete one of COMP1100 or COMP1130.",
      }),
    ],
    conditions: [
      condition({}),
      condition({
        condition_key: "requirements:comp1100",
        condition_kind: "course_set_units",
        group_id: 2,
        id: 11,
        minimum_count: 1,
        minimum_units: null,
        position: 1,
        source_text: "COMP1100",
      }),
      condition({
        condition_key: "requirements:comp1130",
        condition_kind: "course_set_units",
        group_id: 2,
        id: 12,
        minimum_count: 1,
        minimum_units: null,
        position: 2,
        source_text: "COMP1130",
      }),
    ],
    options: [
      {
        code: "COMP1100",
        condition_id: 11,
        id: 20,
        item_id: null,
        kind: "course",
        position: 1,
        snapshot_id: 70,
        source_text: null,
        title: null,
      },
      {
        code: "COMP1130",
        condition_id: 12,
        id: 21,
        item_id: null,
        kind: "course",
        position: 1,
        snapshot_id: 70,
        source_text: null,
        title: null,
      },
    ],
  });

  assert.equal(tree?.operator, "all_of");
  assert.equal(tree?.children[0]?.type, "condition");
  assert.equal(tree?.children[1]?.type, "group");
  const choice = tree?.children[1];
  assert.equal(choice?.type, "group");
  if (choice?.type !== "group") return;
  assert.equal(choice.operator, "any_of");
  assert.deepEqual(
    choice.children.map((child) =>
      child.type === "condition"
        ? {
            key: child.projectionKey,
            optionCodes: child.options.map((option) => option.code),
          }
        : null,
    ),
    [
      { key: "requirements:comp1100", optionCodes: ["COMP1100"] },
      { key: "requirements:comp1130", optionCodes: ["COMP1130"] },
    ],
  );
});

test("returns no tree when a published snapshot has no relational root", () => {
  assert.equal(
    buildAcademicStructureRequirementTree({
      groups: [],
      conditions: [],
      options: [],
    }),
    null,
  );
});

test("selects the latest year through published programme pointers and loads relational rules", async () => {
  const source = await readFile(
    new URL("../lib/coursemap/plan-catalogue.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\.eq\("kind", "programme"\)/u);
  assert.match(source, /\.not\("published_snapshot_id", "is", null\)/u);
  assert.match(source, /\.order\("year", \{ ascending: false \}\)/u);
  assert.match(source, /from\("plan_structures"\)/u);
  assert.match(source, /selectedStructureYears\.has\(structureYear\.id\)/u);
  for (const table of [
    "requirement_groups",
    "requirement_conditions",
    "requirement_condition_options",
  ]) {
    assert.match(source, new RegExp(`from\\("${table}"\\)`, "u"));
  }
  assert.doesNotMatch(source, /academic_structure_requirement/u);
  assert.match(source, /structureRequirements/u);
  for (const kind of ["programme", "major", "minor", "specialisation"]) {
    assert.match(source, new RegExp(`"${kind}"`, "u"));
  }
  assert.match(
    source,
    /requirement\.structureKind === "programme"/u,
    "the programme requirement signal must not be widened to supplementary structures",
  );
  assert.doesNotMatch(source, /snapshot\.units === null \? 0/u);
  assert.match(
    source,
    /snapshot\.duration_years === null\s+\? null\s+: Number/u,
  );
});
