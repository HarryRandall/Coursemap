import { expect, it } from "vitest";
import { structureForName } from "../lib/catalogue-import/kinds/structure/known-structures";

it("resolves only an unambiguous title within the requested kind", () => {
  const major = {
    kind: "major" as const,
    code: "MATH-MAJ",
    name: "Mathematics",
  };
  const minor = {
    kind: "minor" as const,
    code: "MATH-MIN",
    name: "Mathematics",
  };
  expect(structureForName(" Mathematics ", "major", [minor, major])).toEqual(
    major,
  );
  expect(
    structureForName("Applied Mathematics", "major", [major]),
  ).toBeUndefined();
  expect(
    structureForName("Mathematics", "major", [
      major,
      { ...major, code: "OTHER-MAJ" },
    ]),
  ).toBeUndefined();
});
