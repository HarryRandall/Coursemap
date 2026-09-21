import { expect, test } from "vitest";

import {
  emptyCatalogueContent,
  validateCatalogueContent,
} from "@/lib/catalogue/content";

test("manual course authoring starts with a complete kind-specific aggregate", () => {
  const content = emptyCatalogueContent({
    kind: "course",
    code: "COMP1000",
    academicYear: 2027,
    title: "Foundations of Computing",
  });

  expect(validateCatalogueContent(content)).toEqual(content);
  if (!content.course) throw new Error("Expected course content.");
  expect(content.course.details).toMatchObject({
    title: "Foundations of Computing",
    subjectCode: "COMP",
    level: 1000,
    unitValueKind: "fixed",
    units: 6,
  });
  expect(content.requirements.rules).toEqual([]);
});

test("manual structure authoring uses structure fields rather than course fields", () => {
  const content = emptyCatalogueContent({
    kind: "programme",
    code: "BTEST",
    academicYear: 2027,
    title: "Bachelor of Testing",
  });

  expect(validateCatalogueContent(content)).toEqual(content);
  if (!content.structure) throw new Error("Expected structure content.");
  expect(content.structure.details.name).toBe("Bachelor of Testing");
  expect(content.structure.sections).toEqual([]);
});

test("draft validation rejects incomplete aggregates before persistence", () => {
  expect(() =>
    validateCatalogueContent({
      kind: "course",
      code: "COMP1000",
      academicYear: 2027,
      course: { details: { title: "Incomplete" } },
      requirements: {},
    }),
  ).toThrow("The catalogue content aggregate is incomplete.");
});
