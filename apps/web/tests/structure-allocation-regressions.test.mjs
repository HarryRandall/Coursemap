import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { requirementTreeFromSource } from "../lib/coursemap/requirement-write-tree.ts";
import {
  allocateRequirements,
  requirementTreeProgress,
  requirementNodeKey,
} from "../lib/coursemap/requirement-progress.ts";

function fixture(name) {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/catalogue/allocation/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}
function node(root, key) {
  if ((root.groupKey ?? root.projectionKey) === key) return root;
  return root.children?.map((child) => node(child, key)).find(Boolean);
}
function evaluate(source, codes, tags = [], pinKeys = {}) {
  const root = requirementTreeFromSource(source);
  const courses = codes.map((code) => ({
    code,
    name: code,
    year: 2027,
    units: 6,
    level: Number(code[4]) * 1000,
    subject: code.slice(0, 4),
    sessions: [],
    tags: tags.includes(code) ? ["Transdisciplinary Problem-Solving"] : [],
  }));
  const attempts = codes.map((courseCode, id) => ({
    id: String(id),
    courseCode,
    termId: "2027-s1",
    academicYear: 2027,
    status: "completed",
  }));
  const catalogue = {
    courses,
    terms: [{ id: "2027-s1", year: 2027, name: "Semester 1", shortName: "S1" }],
  };
  const pins = new Map(
    Object.entries(pinKeys).map(([code, key]) => [
      code,
      requirementNodeKey(node(root, key)),
    ]),
  );
  const allocation = allocateRequirements({ root, attempts, catalogue, pins });
  const progress = requirementTreeProgress({
    root,
    attempts,
    catalogue,
    allocation,
  });
  return {
    allocation,
    at: (key) => progress.get(requirementNodeKey(node(root, key))),
  };
}
const compulsory = ["STAT3004", "STAT3006", "STAT3015"];
const analysis = ["MATH2320", "MATH3320", "STAT3017"];
const mathematical = ["MATH2305", "MATH2306", "STAT3013", "STAT3056"];

test("PSTO2027 chooses a complete pathway before allocating overlapping STAT courses", () => {
  const source = fixture("psto-2027");
  for (const codes of [
    [...compulsory, "STAT3013", ...analysis, "STAT2001"],
    [...compulsory, "MATH3015", ...analysis, "STAT2001"],
    [...compulsory, "STAT2002", ...analysis, "STAT2001"],
    [...compulsory, "MATH3015", "STAT3017", ...mathematical],
  ]) {
    assert.equal(evaluate(source, codes).at("root").state, "satisfied");
    assert.equal(
      evaluate(source, [...codes].reverse()).at("root").state,
      "satisfied",
    );
  }
  assert.notEqual(
    evaluate(source, [
      ...compulsory,
      "MATH3015",
      "MATH2320",
      "MATH3320",
      "STAT2001",
      "STAT2002",
    ]).at("root").state,
    "satisfied",
  );
  assert.notEqual(
    evaluate(source, [...compulsory, ...analysis, "STAT2001"]).at("root").state,
    "satisfied",
  );
});

test("whole-path allocation retains valid explicit pins", () => {
  const result = evaluate(
    fixture("psto-2027"),
    [...compulsory, "STAT3013", ...analysis, "STAT2001"],
    [],
    { STAT3013: "additional-stat", STAT2001: "further-stat" },
  );
  assert.equal(result.at("root").state, "satisfied");
  assert.equal(result.allocation.get("STAT3013").pinned, true);
  assert.equal(result.allocation.get("STAT2001").pinned, true);
});

test("BCOMP2025 degree total does not reuse compulsory credit for its restricted six-unit union", () => {
  const source = fixture("bcomp-2025");
  assert.equal(
    evaluate(source, ["COMP1100"]).at("restricted-six-pool").completedUnits,
    0,
  );
  assert.equal(
    evaluate(source, ["COMP1100", "ENGN2001"]).at("restricted-six-pool").state,
    "satisfied",
  );
  assert.equal(
    evaluate(source, ["COMP1100", "FINM2001"]).at("restricted-six-pool")
      .completedUnits,
    0,
  );
  const codes = [
    "COMP1100",
    "COMP1110",
    "MATH1005",
    "COMP1600",
    "COMP2100",
    "COMP2300",
    "COMP2400",
    ...Array.from({ length: 8 }, (_, i) => `COMP${3001 + i}`),
    "ENGN2001",
    ...Array.from({ length: 8 }, (_, i) => `FINM${2001 + i}`),
  ];
  const valid = evaluate(source, codes, ["COMP3001", "COMP3002"]);
  assert.equal(valid.at("root").state, "satisfied");
  assert.equal(valid.at("root").completedUnits, 144);
  assert.equal(valid.at("computing_majors").state, "unmeasured");
  assert.equal(
    evaluate(source, [...codes, "FINM2999"], ["COMP3001", "COMP3002"]).at(
      "root",
    ).state,
    "over_limit",
  );
});

test("BECON2025 optional open capacity remains locally measurable beside its minimum48 pool", () => {
  const source = fixture("becon-2025");
  const core = [
    "ECON1101",
    "ECON2101",
    "ECON3101",
    "ECON3102",
    "EMET1001",
    "EMET2007",
    "STAT1008",
    "ECON1102",
    "ECON2102",
  ];
  const tps = ["ECHI3009", "ECON3004"];
  const restricted = ["EMET3004", "EMET3006", "EMET3007"];
  const codes = [
    ...core,
    ...tps,
    ...restricted,
    ...Array.from({ length: 10 }, (_, i) => `COMP${2000 + i}`),
  ];
  const result = evaluate(source, codes, tps);
  assert.equal(result.at("root").state, "satisfied");
  assert.equal(result.at("open-electives-cap12").completedUnits, 12);
  assert.equal(result.at("open-electives48").completedUnits, 48);
  assert.notEqual(
    evaluate(source, codes.slice(0, -3), tps).at("root").state,
    "satisfied",
  );
  assert.notEqual(
    evaluate(
      source,
      codes
        .filter((c) => !restricted.includes(c))
        .concat(["COMP3001", "COMP3002", "COMP3003"]),
      tps,
    ).at("root").state,
    "satisfied",
  );
});

test("BCOMM2027 unrestricted units allocate while an unsupported selected major stays unmeasured", () => {
  const source = fixture("bcomm-2027");
  const codes = [
    "BUSN1001",
    "ECON1101",
    "ECON1102",
    "MGMT2100",
    "STAT1008",
    ...Array.from({ length: 19 }, (_, i) => `COMP${3000 + i}`),
  ];
  const result = evaluate(source, codes, ["COMP3000", "COMP3001"]);
  assert.equal(result.at("additional-electives").completedUnits, 18);
  assert.ok(result.at("electives").completedUnits >= 48);
  assert.equal(result.at("major_req").state, "unmeasured");
  assert.notEqual(result.at("root").state, "satisfied");
});

test("standalone explicit degree overlays retain subject membership and do not count unrelated credit", () => {
  const source = fixture("becon-2025");
  const full = requirementTreeFromSource(source);
  const overlay = node(full, "level3000-subjects");
  const catalogue = {
    courses: ["COMP3001", "FINM3001", "STAT3001"].map((code) => ({
      code,
      name: code,
      year: 2027,
      units: 6,
      level: 3000,
      subject: code.slice(0, 4),
      sessions: [],
    })),
    terms: [],
  };
  const attempts = catalogue.courses.map(({ code }, id) => ({
    id: String(id),
    courseCode: code,
    academicYear: 2027,
    termId: "2027-s1",
    status: "completed",
  }));
  const progress = requirementTreeProgress({
    root: overlay,
    catalogue,
    attempts,
  });
  assert.equal(progress.get(requirementNodeKey(overlay)).completedUnits, 0);
  assert.notEqual(progress.get(requirementNodeKey(overlay)).state, "satisfied");
});
