import { expect, test } from "vitest";

import {
  assertStructureVocabulary,
  emptyCatalogueContent,
  validateCatalogueContent,
} from "@/lib/catalogue/content";
import { structureDetailsFromWrite } from "@/lib/coursemap/structure-version-view";

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

function structureWith(
  sections: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
) {
  const content = emptyCatalogueContent({
    kind: "major",
    code: "MATH-MAJ",
    academicYear: 2026,
    title: "Mathematics",
  });
  if (!content.structure) throw new Error("Expected structure content.");
  content.structure.sections = sections as never;
  content.structure.relationships = relationships as never;
  return content;
}

const section = (sectionKey: string) => ({
  position: 1,
  sectionKey,
  heading: "Any heading",
  markdown: "- MATH1115 Advanced Mathematics and Applications 1",
  sourceText: "MATH1115 Advanced Mathematics and Applications 1",
  sourceLocator: "manual",
});

const relationship = (relationshipKind: string) => ({
  position: 1,
  relationshipKind,
  targetKind: "programme",
  targetCode: "BSC",
  targetTitle: "Bachelor of Science",
  sourceText: "Bachelor of Science",
  sourceLocator: "manual",
});

test("a submitted structure keeps to the fixed sections and relationships", () => {
  expect(() =>
    assertStructureVocabulary(
      structureWith(
        [section("first_year_advice")],
        [relationship("offered_in")],
      ),
    ),
  ).not.toThrow();
  expect(() =>
    assertStructureVocabulary(
      structureWith([section("other-information")], []),
    ),
  ).toThrow("Every section needs one of the fixed section types.");
  expect(() =>
    assertStructureVocabulary(
      structureWith([], [relationship("source_reference")]),
    ),
  ).toThrow(/offered in, an option or incompatible/);
});

test("readers show only the fixed vocabulary, under Coursemap's headings", () => {
  const content = structureWith(
    [section("first_year_advice"), section("other-information")],
    [relationship("offered_in"), relationship("relevant")],
  );
  // Stored content from an older sync can still hold retired values; reading
  // it must not fail, and those values are not shown.
  expect(validateCatalogueContent(content)).toEqual(content);
  const details = structureDetailsFromWrite(content);
  expect(
    details?.sections.map(({ sectionKey, heading }) => [sectionKey, heading]),
  ).toEqual([["first_year_advice", "First-year advice"]]);
  expect(
    details?.relationships.map(({ relationshipKind }) => relationshipKind),
  ).toEqual(["offered_in"]);
});
