import { expect, test } from "vitest";

import { requirementWriteWithTree } from "@/lib/catalogue-import/requirement-tree";
import { emptyCatalogueContent } from "@/lib/catalogue/content";
import {
  catalogueContentWithRecordedRule,
  recordedRuleContent,
} from "@/lib/catalogue/recorded-rule";

function fixture() {
  const content = emptyCatalogueContent({
    kind: "programme",
    code: "BSTAT",
    academicYear: 2027,
  });
  for (const ruleKey of ["structure", "permission"] as const) {
    content.requirements = requirementWriteWithTree(
      content.requirements,
      ruleKey,
      {
        type: "group",
        id: "root",
        operator: "all_of",
        minimumCount: null,
        children: [
          {
            type: "condition",
            id: "major",
            kind: "structure",
            structureCode: "PRST-MAJ",
          },
        ],
      },
      "One approved major.",
    );
  }
  const condition = content.requirements.conditions.find(
    (row) => row.ruleKey === "structure",
  )!;
  condition.kind = "structure_set";
  condition.structureKind = "major";
  content.requirements.options.push({
    conditionKey: condition.key,
    position: 0,
    kind: "major",
    code: "PRST-MAJ",
    title: null,
    sourceText: null,
  });
  return content;
}

test("recorded correction preserves the latest metadata, evidence and unrelated rule rows", () => {
  const content = fixture();
  const recorded = recordedRuleContent(content, "structure");
  const baseline = JSON.stringify(recorded);
  const submitted = structuredClone(recorded);
  submitted.options[0]!.code = "PSTO-MAJ";
  content.structure!.details.description = "A later description edit";
  const next = catalogueContentWithRecordedRule(
    content,
    "structure",
    submitted,
    baseline,
  );
  expect(next.structure).toEqual(content.structure);
  expect(next.evidence).toEqual(content.evidence);
  expect(next.flags).toEqual(content.flags);
  expect(next.requirements.rules).toEqual(content.requirements.rules);
  expect(next.requirements.references).toEqual(content.requirements.references);
  expect(recordedRuleContent(next, "permission")).toEqual(
    recordedRuleContent(content, "permission"),
  );
  expect(recordedRuleContent(next, "structure").options[0]!.code).toBe(
    "PSTO-MAJ",
  );
  expect(content.requirements.options[0]!.code).toBe("PRST-MAJ");
});

test.each([
  "cross-rule",
  "key collision",
  "orphan option",
  "cycle",
  "invalid units",
  "unknown field",
  "invalid kind",
])("rejects %s corrections", (invalid) => {
  const content = fixture();
  const submitted = structuredClone(recordedRuleContent(content, "structure"));
  const baseline = JSON.stringify(submitted);
  if (invalid === "cross-rule") submitted.conditions[0]!.ruleKey = "permission";
  if (invalid === "key collision")
    submitted.conditions[0]!.key = content.requirements.conditions.find(
      (row) => row.ruleKey === "permission",
    )!.key;
  if (invalid === "orphan option") submitted.options[0]!.conditionKey = "other";
  if (invalid === "cycle")
    submitted.groups.push({
      ...submitted.groups[0]!,
      key: "cycle",
      parentKey: "cycle",
    });
  if (invalid === "invalid units") submitted.conditions[0]!.minimumUnits = -1;
  const unknown: unknown =
    invalid === "unknown field"
      ? { ...submitted, rules: [] }
      : invalid === "invalid kind"
        ? {
            ...submitted,
            conditions: [{ ...submitted.conditions[0], kind: "invented" }],
          }
        : submitted;
  expect(() =>
    catalogueContentWithRecordedRule(content, "structure", unknown, baseline),
  ).toThrow();
});

test("rejects a stale selected rule and invalid complete catalogue content", () => {
  const content = fixture();
  const submitted = recordedRuleContent(content, "structure");
  const baseline = JSON.stringify(submitted);
  content.requirements.options[0]!.code = "STDA-MAJ";
  expect(() =>
    catalogueContentWithRecordedRule(content, "structure", submitted, baseline),
  ).toThrow("changed while you were editing");
  content.structure!.details.name = "";
  expect(() =>
    catalogueContentWithRecordedRule(
      content,
      "structure",
      recordedRuleContent(content, "structure"),
      JSON.stringify(recordedRuleContent(content, "structure")),
    ),
  ).toThrow();
});

test("optional reference corrections stay within the selected rule and omitted indices are preserved", () => {
  const content = fixture();
  content.requirements.references = [
    {
      ruleKey: "structure",
      code: "PRST-MAJ",
      sourceText: "Probability and Stochastic Processes",
      confidence: 1,
      reviewState: "verified",
    },
    {
      ruleKey: "permission",
      code: "CONSENT",
      sourceText: "Other rule",
      confidence: 1,
      reviewState: "verified",
    },
  ];
  const submitted = structuredClone(recordedRuleContent(content, "structure"));
  const baseline = JSON.stringify(submitted);
  submitted.references[0]!.code = "PSTO-MAJ";
  const corrected = catalogueContentWithRecordedRule(
    content,
    "structure",
    submitted,
    baseline,
  );
  expect(
    corrected.requirements.references.find(
      (row) => row.ruleKey === "structure",
    )!.code,
  ).toBe("PSTO-MAJ");
  expect(
    corrected.requirements.references.find(
      (row) => row.ruleKey === "permission",
    ),
  ).toEqual(content.requirements.references[1]);
  const { references, ...withoutReferences } = submitted;
  expect(references).toHaveLength(1);
  expect(
    catalogueContentWithRecordedRule(
      content,
      "structure",
      withoutReferences,
      baseline,
    ).requirements.references,
  ).toEqual(content.requirements.references);
  submitted.references[0]!.ruleKey = "permission";
  expect(() =>
    catalogueContentWithRecordedRule(content, "structure", submitted, baseline),
  ).toThrow("only the selected rule");
});
