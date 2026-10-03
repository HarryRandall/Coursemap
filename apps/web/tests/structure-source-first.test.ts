import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compactStructureAdapter } from "../lib/catalogue-import/kinds/structure/compact-adapter";
import { readStructureSource } from "../lib/catalogue-import/kinds/structure/source-parser";
import { parsePlainStructureRequirements } from "../lib/catalogue-import/kinds/structure/plain-requirements";
import { sourceFirstPublicationEligible } from "../lib/catalogue-runs/eligibility";
import { courseRunEstimate } from "../lib/catalogue-runs/estimates";
import { parseCourseRunOptions } from "../lib/catalogue-runs/options";
import type { AcademicStructureKind } from "../lib/catalogue-import/kinds/structure/contract";
import type { ClaimedCatalogueSync } from "../lib/catalogue-sync/sync-store";

const samples = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/catalogue/anu-2026-structure-source-first.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Array<{
  kind: AcademicStructureKind;
  code: string;
  year: number;
  markdown: string;
}>;
const finance = samples.find((sample) => sample.code === "FINM-MAJ")!;
function finalise(sample: typeof finance, model: unknown = {}) {
  return compactStructureAdapter.finalise({
    claim: {
      kind: sample.kind,
      code: sample.code,
      academicYear: sample.year,
    } as ClaimedCatalogueSync,
    listingTitle: null,
    pageMarkdown: sample.markdown,
    model,
    responseError: null,
    finishReason: "stop",
  });
}

it("reads the captured finance allocations exactly, preserving all compulsory courses and the elective list", () => {
  const source = readStructureSource(
    finance.kind,
    finance.code,
    finance.year,
    finance.markdown,
  );
  expect(source.plain?.rule?.type).toBe("group");
  const content = compactStructureAdapter.project(finalise(finance).extraction);
  expect(
    content.requirements.conditions.map((condition) => [
      condition.minimumUnits,
      condition.minimumCount,
    ]),
  ).toEqual([
    [30, 5],
    [18, null],
  ]);
  expect(content.requirements.options.map((option) => option.code)).toEqual([
    "FINM1001",
    "FINM2001",
    "FINM2002",
    "FINM3011",
    "STAT2008",
    "FINM3005",
    "FINM3006",
    "FINM3008",
    "FINM3015",
    "FINM3045",
    "STAT3011",
  ]);
  // Complete enrolment advice remains visible alongside verified allocations.
  expect(sourceFirstPublicationEligible(content)).toBe(true);
  expect(
    finalise(finance).extraction.sections.find(
      (section) => section.key === "advice",
    )?.markdown,
  ).toContain("enrol");
});

it.each(
  samples.filter((sample) =>
    ["ACCT-MAJ", "POLS-MAJ", "MATH-MIN"].includes(sample.code),
  ),
)(
  "retains metadata and source wording when interpretation fails for $code",
  (sample) => {
    const result = finalise(sample);
    expect(result.canPersist).toBe(true);
    const content = compactStructureAdapter.project(result.extraction);
    expect(content.flags.length).toBeGreaterThan(0);
    expect(sourceFirstPublicationEligible(content)).toBe(false);
    expect(result.extraction.title).not.toBe(sample.code);
    expect(result.extraction.requirements.sourceText).toContain(
      "requires the completion",
    );
    expect(result.extraction.introduction).not.toContain("Tweet");
  },
);

const simple = finance.markdown.replace(
  /## Other Information[\s\S]*?(?=## Relevant Degrees)/u,
  "",
);
it("holds conflicting unit totals instead of trusting the first summary value", () => {
  const result = finalise({
    ...finance,
    markdown: simple.replace(
      "- Total units 48 Units",
      "- Total units 48 Units\n- Total units 24 Units",
    ),
  });
  expect(
    sourceFirstPublicationEligible(
      compactStructureAdapter.project(result.extraction),
    ),
  ).toBe(false);
});

it("holds exact-one-course allocations that cannot be represented as a unit-only choice", () => {
  expect(
    parsePlainStructureRequirements(
      "This minor requires the completion of 6 units, which must include:\n6 units from completion of a course from the following list:\nTEST1001 Example one\nTEST1002 Example two",
      6,
    ),
  ).toBeNull();
});

describe.each(["major", "minor", "specialisation"] as const)(
  "verified %s candidates",
  (kind) => {
    it("only publishes a complete independently verified source", () => {
      const sample = {
        ...finance,
        kind,
        code: `TEST-${kind === "major" ? "MAJ" : kind === "minor" ? "MIN" : "SPEC"}`,
        markdown: simple
          .replaceAll("major", kind)
          .replaceAll("Major", kind[0]!.toUpperCase() + kind.slice(1)),
      };
      const result = finalise(sample, {
        title: "Invented title",
        requirements: { rule: null },
      });
      const content = compactStructureAdapter.project(result.extraction);
      expect(content.flags).toEqual([]);
      expect(sourceFirstPublicationEligible(content)).toBe(true);
      expect(result.extraction.title).toBe("Finance");
      expect(
        sourceFirstPublicationEligible({
          ...content,
          evidence: content.evidence.filter(
            (item) => item.fieldPath !== "sourceCoverage",
          ),
        }),
      ).toBe(false);
      expect(
        sourceFirstPublicationEligible({
          ...content,
          evidence: content.evidence.map((item) => ({
            ...item,
            method: "model",
          })),
        }),
      ).toBe(false);
    });
  },
);

it.each([
  "Students must also complete another major.",
  "Students may substitute an approved course.",
])("holds external constraints: %s", (constraint) => {
  const sample = {
    ...finance,
    markdown: simple.replace(
      "## Learning Outcomes",
      `${constraint}\n\n## Learning Outcomes`,
    ),
  };
  expect(
    sourceFirstPublicationEligible(
      compactStructureAdapter.project(finalise(sample).extraction),
    ),
  ).toBe(false);
});

it.each([
  "\nPermission is required to substitute courses.",
  "\nFINM1001 repeated course",
  "\nOR\n12 units from another list",
])(
  "rejects incomplete, duplicated or alternative allocations: %s",
  (suffix) => {
    const source = readStructureSource(
      finance.kind,
      finance.code,
      finance.year,
      finance.markdown,
    );
    expect(
      parsePlainStructureRequirements(source.requirementsText + suffix, 48),
    ).toBeNull();
    expect(
      parsePlainStructureRequirements(source.requirementsText, 24),
    ).toBeNull();
  },
);

it("keeps structure estimates separate from the measured course sample", () => {
  const estimate = courseRunEstimate({
    count: 10,
    kind: "minor",
    model: "google/gemini-3.1-flash-lite",
    inputPrice: 0.25,
    outputPrice: 1.5,
    sampleCount: 0,
    averageCost: null,
  });
  expect(estimate.estimatedUsd).toBeNull();
  expect(estimate.maximumUsd).toBeCloseTo(0.16);
  expect(
    parseCourseRunOptions({ year: 2026, kind: "specialisation" }).kind,
  ).toBe("specialisation");
  expect(() =>
    parseCourseRunOptions({ year: 2026, kind: "programme" }),
  ).toThrow();
});

it("independently verifies the captured International Policy specialisation without AI", () => {
  const sample = samples.find((item) => item.code === "INPL-SPEC")!;
  const result = finalise(sample);
  const content = compactStructureAdapter.project(result.extraction);
  expect(sourceFirstPublicationEligible(content)).toBe(true);
  expect(content.requirements.options).toHaveLength(15);
  expect(content.requirements.conditions[0]?.minimumUnits).toBe(24);
});

it.each([
  "***Choose one***\nTEST1001 First course\nTEST1002 Second course",
  "TEST1001 First course (subject to approval)\nTEST1002 Second course",
  "TEST1001 First course (6 units)\nTEST1002 Second course (6 units)",
])("holds qualifiers and inconsistent compulsory units: %s", (rows) => {
  expect(
    parsePlainStructureRequirements(
      `This minor requires the completion of 24 units, which must include:\n24 units from the following compulsory courses:\n${rows}`,
      24,
    ),
  ).toBeNull();
});
