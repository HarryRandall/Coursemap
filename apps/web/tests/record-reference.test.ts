import { expect, test } from "vitest";

import {
  catalogueKindForCode,
  catalogueRecordFromReference,
} from "@/lib/catalogue/record-reference";

test("a code's shape names its catalogue kind", () => {
  expect(catalogueKindForCode("MATH1115")).toBe("course");
  expect(catalogueKindForCode("MATH-MAJ")).toBe("major");
  expect(catalogueKindForCode("AARB-MIN")).toBe("minor");
  expect(catalogueKindForCode("ADMA-SPEC")).toBe("specialisation");
  expect(catalogueKindForCode("COMP-HSPC")).toBe("specialisation");
  expect(catalogueKindForCode("BARTS")).toBe("programme");
});

test("record links open in Coursemap whether written as a code or an ANU address", () => {
  expect(catalogueRecordFromReference("BARTS")).toEqual({
    kind: "programme",
    code: "BARTS",
  });
  expect(
    catalogueRecordFromReference(
      "http://programsandcourses.anu.edu.au/major/MATH-MAJ",
    ),
  ).toEqual({ kind: "major", code: "MATH-MAJ" });
  expect(
    catalogueRecordFromReference(
      "https://programsandcourses.anu.edu.au/2026/program/AACOM",
    ),
  ).toEqual({ kind: "programme", code: "AACOM" });
  expect(
    catalogueRecordFromReference("https://study.anu.edu.au/apply"),
  ).toBeNull();
  expect(
    catalogueRecordFromReference("mailto:students.cos@anu.edu.au"),
  ).toBeNull();
  expect(catalogueRecordFromReference("apply")).toBeNull();
});
