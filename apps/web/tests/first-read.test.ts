import { expect, test } from "vitest";
import {
  type CatalogueContent,
  emptyCatalogueContent,
} from "@/lib/catalogue/content";
import { classifyFirstRead } from "@/lib/catalogue/first-read";

function course(): CatalogueContent {
  const content = emptyCatalogueContent({
    kind: "course",
    code: "COMP2710",
    academicYear: 2026,
    title: "Special Topics in Computer Science",
  });
  content.course!.details.description = "Advanced topics.";
  content.course!.details.convenerText = "Dr Example";
  content.evidence = [
    {
      fieldPath: "title",
      method: "model",
      confidence: 0.98,
      sourceLocator: null,
      sourceExcerpt: null,
    },
    {
      fieldPath: "description",
      method: "model",
      confidence: 0.82,
      sourceLocator: null,
      sourceExcerpt: null,
    },
  ];
  return content;
}

function band(content: CatalogueContent, fieldPath: string) {
  return classifyFirstRead(content).find(
    (item) => item.fieldPath === fieldPath,
  );
}

test("confidence sorts plain readings from ones worth a look", () => {
  const content = course();
  expect(band(content, "course.details.title")).toMatchObject({
    band: "accepted",
    confidence: 0.98,
  });
  expect(band(content, "course.details.description")).toMatchObject({
    band: "check",
    confidence: 0.82,
  });
  expect(band(content, "course.details.convenerText")).toMatchObject({
    band: "check",
    confidence: null,
    reason: "No evidence was given for this",
  });
  // Empty parts of the reading have nothing to review.
  expect(band(content, "course.details.workloadText")).toBeUndefined();
});

test("a model error puts a part up for review whatever its confidence", () => {
  const content = course();
  content.flags = [
    {
      fieldPath: "title",
      severity: "error",
      code: "conflict",
      message: "The page gives two titles.",
      sourceExcerpt: null,
    },
  ];
  expect(band(content, "course.details.title")).toMatchObject({
    band: "needs_review",
    reason: "The page gives two titles.",
  });
});

test("a rule split from one sentence needs review, as COMP2710's permission did", () => {
  const content = course();
  const sentence =
    "You will need to contact the School of Computing to request a permission code.";
  content.requirements.rules.push({
    key: "prerequisite",
    hardness: "hard",
    sourceText: sentence,
    sourceLocator: null,
    reviewState: "automatic",
    confidence: 0.95,
    position: 1,
  });
  for (const [position, kind] of (
    ["permission", "permission"] as const
  ).entries()) {
    content.requirements.conditions.push({
      key: `condition-${position}`,
      ruleKey: "prerequisite",
      groupKey: "root",
      position,
      kind,
      itemCode: null,
      itemKind: null,
      structureKind: null,
      requirementMode: null,
      minimumMark: null,
      minimumUnits: null,
      maximumUnits: null,
      minimumCount: null,
      subjectCode: null,
      minimumLevel: null,
      maximumLevel: null,
      minimumYear: null,
      minimumGpa: null,
      minimumWam: null,
      tag: null,
      freeText: sentence,
      hardness: "hard",
      sourceText: sentence,
      sourceLocator: null,
      reviewState: "automatic",
      confidence: 0.95,
    });
  }
  expect(band(content, "requirements.prerequisite")).toMatchObject({
    band: "needs_review",
    reason: "One sentence was split into several conditions",
  });
});
