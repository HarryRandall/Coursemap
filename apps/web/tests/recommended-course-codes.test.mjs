import assert from "node:assert/strict";
import { test } from "vitest";

const { recommendedCourseCodes } =
  await import("../lib/coursemap/requirement-display.ts");

function condition(...codes) {
  return {
    type: "condition",
    options: codes.map((code, position) => ({
      code,
      kind: "course",
      position,
      structureKind: null,
    })),
  };
}

function structure(structureCode, ...codes) {
  return {
    structureCode,
    structureKind: "programme",
    root: { type: "group", children: [condition(...codes)] },
  };
}

const profile = {
  degreeCode: "BCOMP",
  majorCode: "",
  minorCodes: [],
  specialisationCodes: [],
};

test("recommends chosen structures' courses that are not yet planned", () => {
  const catalogue = {
    structureRequirements: [
      structure("BCOMP", "COMP1100", "COMP1110", "MATH1005"),
      structure("OTHER", "ECON1101"),
    ],
  };
  const attempts = [
    { courseCode: "COMP1100", status: "planned" },
    { courseCode: "MATH1005", status: "withdrawn" },
  ];
  assert.deepEqual(recommendedCourseCodes(catalogue, profile, attempts), [
    "COMP1110",
    "MATH1005",
  ]);
});

test("recommends nothing before a degree is chosen", () => {
  const catalogue = {
    structureRequirements: [structure("BCOMP", "COMP1100")],
  };
  assert.deepEqual(
    recommendedCourseCodes(catalogue, { ...profile, degreeCode: "" }, []),
    [],
  );
});
