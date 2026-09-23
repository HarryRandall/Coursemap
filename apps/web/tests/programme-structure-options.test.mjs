import assert from "node:assert/strict";
import { test } from "vitest";

import { collectSelectableStructureCodes } from "../lib/coursemap/programme-structure-options.ts";

test("keeps only a programme's options as student choices", () => {
  const codes = collectSelectableStructureCodes({
    programmeVersionIds: new Set([101]),
    relationships: [
      relationship("option", "MATH-MAJ"),
      relationship("option", "COMP-MAJ"),
      relationship("offered_in", "STAT-MAJ"),
      relationship("incompatible", "ANTH-MAJ"),
      // Kinds older snapshots used are no longer choices.
      relationship("required", "PHYS-MAJ"),
      relationship("source_reference", "ECON-MAJ"),
      relationship("option", "DATA-MIN", "minor"),
      { ...relationship("option", "CHEM-MAJ"), version_id: 202 },
    ],
    requirementConditions: [],
    requirementOptions: [],
  });

  assert.deepEqual(codes.get(101), {
    major: ["COMP-MAJ", "MATH-MAJ"],
    minor: ["DATA-MIN"],
    specialisation: [],
  });
  assert.equal(codes.has(202), false);
});

test("includes structure options from programme structure-set requirements", () => {
  const codes = collectSelectableStructureCodes({
    programmeVersionIds: new Set([101]),
    relationships: [],
    requirementConditions: [
      condition(1, "structure_set", "major"),
      condition(2, "course_set_units", "major"),
      condition(3, "structure_set", "minor"),
      condition(5, "structure_set", "specialisation"),
      { ...condition(4, "structure_set", "major"), version_id: 202 },
    ],
    requirementOptions: [
      option(1, "MATH-MAJ"),
      option(1, "COMP-MAJ"),
      option(2, "STAT-MAJ"),
      option(3, "DATA-MIN", "minor"),
      option(5, "AI-SPEC", "specialisation"),
      { ...option(1, "PHYS-MAJ"), version_id: 202 },
      { ...option(4, "CHEM-MAJ"), version_id: 202 },
      { ...option(1, "ECON-MAJ"), kind: "course" },
    ],
  });

  assert.deepEqual(codes.get(101), {
    major: ["COMP-MAJ", "MATH-MAJ"],
    minor: ["DATA-MIN"],
    specialisation: ["AI-SPEC"],
  });
  assert.equal(codes.has(202), false);
});

function relationship(relationshipKind, targetCode, targetKind = "major") {
  return {
    relationship_kind: relationshipKind,
    version_id: 101,
    target_code: targetCode,
    target_kind: targetKind,
  };
}

function condition(id, conditionKind, structureKind) {
  return {
    condition_kind: conditionKind,
    id,
    version_id: 101,
    structure_kind: structureKind,
  };
}

function option(conditionId, code, kind = "major") {
  return {
    code,
    condition_id: conditionId,
    kind,
    version_id: 101,
  };
}
