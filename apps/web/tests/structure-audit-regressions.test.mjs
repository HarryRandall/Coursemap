import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compactStructureAdapter } from "../lib/catalogue-import/kinds/structure/compact-adapter.ts";
import { validateAcademicStructureExtraction } from "../lib/catalogue-import/kinds/structure/contract.ts";
import { sourceFirstPublicationEligible } from "../lib/catalogue-runs/eligibility.ts";

const samples = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/catalogue/anu-2026-structure-audit.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const knownStructures = samples.map((item) => ({
  code: item.code,
  kind: item.kind,
  name: item.markdown.match(/^# (.+)$/m)[1],
}));
function replay(sample, overrides = {}) {
  return compactStructureAdapter.finalise({
    claim: { kind: sample.kind, code: sample.code, academicYear: sample.year },
    listingTitle: null,
    pageMarkdown: sample.markdown,
    model: sample.model,
    responseError: null,
    finishReason: "stop",
    context: { knownTags: [], knownStructures },
    ...overrides,
  });
}
function sample(code) {
  return samples.find((item) => item.code === code);
}

it.each(samples)(
  "projects the captured $code source without duplicate fields or malformed conditions",
  (entry) => {
    const result = replay(entry);
    expect(result.canPersist).toBe(true);
    const validated = validateAcademicStructureExtraction(result.extraction);
    expect(validated.success, JSON.stringify(validated.issues)).toBe(true);
    const content = compactStructureAdapter.project(result.extraction);
    const flags = content.flags.map((flag) => JSON.stringify(flag));
    expect(new Set(flags).size).toBe(flags.length);
    for (const condition of content.requirements.conditions) {
      if (condition.kind === "course_set_units")
        expect(
          condition.minimumUnits !== null ||
            condition.maximumUnits !== null ||
            condition.minimumCount !== null,
        ).toBe(true);
    }
  },
);

it.each([
  "ACCT-HSPC",
  "AINS-HSPC",
  "ARCH-HSPC",
  "ASTR-HSPC",
  "BISS-HSPC",
  "CHEM-HSPC",
])("keeps the admission and other source sections for %s", (code) => {
  const result = replay(sample(code));
  expect(
    result.extraction.sections.some((section) => section.key === "admission"),
  ).toBe(true);
  expect(
    sourceFirstPublicationEligible(
      compactStructureAdapter.project(result.extraction),
    ),
  ).toBe(!["ASTR-HSPC", "CHEM-HSPC"].includes(code));
});

it.each(["AFRE-MIN", "CHIN-MAJ"])(
  "turns unbounded course lists into reviewable wording for %s before persistence",
  (code) => {
    const result = replay(sample(code));
    expect(
      result.extraction.reviewItems.some((item) =>
        item.message.includes("did not fit the contract"),
      ),
    ).toBe(true);
    const content = compactStructureAdapter.project(result.extraction);
    expect(
      content.requirements.conditions.some(
        (condition) => condition.kind === "other",
      ),
    ).toBe(true);
    expect(sourceFirstPublicationEligible(content)).toBe(false);
  },
);

it("does not present equivalent course codes as independently countable compulsory choices", () => {
  const result = replay(sample("ACMG-MAJ"));
  const content = compactStructureAdapter.project(result.extraction);
  expect(content.requirements.options).toEqual([]);
  expect(content.requirements.conditions[0].freeText).toContain(
    "ASIA2311 / GEND2001",
  );
  expect(
    content.flags.some((flag) => flag.message.includes("equivalent courses")),
  ).toBe(true);
});

it.each(["ACCT-SPEC", "APFN-SPEC", "ANTH-MIN", "AHCS-MIN"])(
  "independently verifies ordinary allocations for %s",
  (code) => {
    const result = replay(sample(code), { model: { requirements: null } });
    expect(
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(result.extraction),
      ),
    ).toBe(true);
    expect(result.report.deterministicRequirements).toBe(true);
  },
);

it("constrains the full total to the listed courses when allocations are ranges", () => {
  const result = replay(sample("ARAB-MAJ"), { model: null });
  const content = compactStructureAdapter.project(result.extraction);
  expect(result.report.deterministicRequirements).toBe(true);
  expect(
    content.requirements.conditions.map((item) => [
      item.minimumUnits,
      item.maximumUnits,
    ]),
  ).toEqual([
    [48, 48],
    [null, 18],
    [18, 48],
    [null, 18],
  ]);
  expect(
    content.requirements.options.filter(
      (item) => item.conditionKey === "listed-total",
    ),
  ).toHaveLength(16);
});

it.each(["APST-MAJ", "AARB-MIN", "ADPH-SPEC", "ANTH-HSPC"])(
  "does not count an unsuccessful provider response as an imported draft for %s",
  (code) => {
    const result = replay(sample(code), {
      model: null,
      finishReason: "error",
      responseError: "Provider rate limit (429).",
    });
    expect(result.canPersist).toBe(false);
  },
);

it("retains repeated requirements instead of silently replacing the first section", () => {
  const entry = sample("ACCT-SPEC");
  const result = replay({
    ...entry,
    markdown: entry.markdown + "\n## Requirements\nPermission is required.\n",
  });
  expect(result.extraction.requirements.sourceText).toContain("24 units");
  expect(result.extraction.requirements.sourceText).toContain(
    "Permission is required.",
  );
  expect(
    sourceFirstPublicationEligible(
      compactStructureAdapter.project(result.extraction),
    ),
  ).toBe(false);
});

it("does not give an unverified AI interpretation 100% confidence", () => {
  const content = compactStructureAdapter.project(
    replay(sample("CHIN-MAJ")).extraction,
  );
  expect(
    content.requirements.conditions.every(
      (item) => item.reviewState === "review" && item.confidence === 0,
    ),
  ).toBe(true);
});

it("replays the full audit with independently verified publication decisions", () => {
  const expected = { major: 14, minor: 15, specialisation: 20 };
  for (const [kind, count] of Object.entries(expected)) {
    const entries = samples.filter((entry) => entry.kind === kind);
    const publishable = entries.filter((entry) =>
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(replay(entry).extraction),
      ),
    );
    expect(publishable).toHaveLength(count);
    for (const entry of publishable) {
      // Eligible entries must not depend on the captured AI answer.
      expect(
        sourceFirstPublicationEligible(
          compactStructureAdapter.project(
            replay(entry, { model: null }).extraction,
          ),
        ),
      ).toBe(true);
    }
  }
});

it.each(["ACCT-HSPC", "ARCH-HSPC", "ADMA-SPEC", "APST-MAJ"])(
  "retains the full admission and enrolment conditions when publishing %s",
  (code) => {
    const entry = sample(code);
    const result = replay(entry, { model: null });
    const content = compactStructureAdapter.project(result.extraction);
    const retained = [
      content.structure.details.introduction,
      ...content.structure.sections.map((section) => section.markdown),
    ].join("\n\n");
    for (const section of entry.markdown.split(/^## /m).slice(1)) {
      const newline = section.indexOf("\n");
      const heading = section.slice(0, newline).trim();
      if (
        [
          "Admission Requirements",
          "Cognate Disciplines",
          "Other Information",
        ].includes(heading)
      ) {
        expect(retained).toContain(section.slice(newline + 1).trim());
      }
    }
    expect(
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(result.extraction),
      ),
    ).toBe(true);
  },
);

it.each(["AGIN-MAJ", "BUSN-MAJ", "BISM-MIN", "ANAC-SPEC"])(
  "still holds completion overrides outside Requirements for %s",
  (code) => {
    const result = replay(sample(code));
    expect(
      result.extraction.reviewItems.some((item) =>
        item.message.includes("Additional completion rules"),
      ),
    ).toBe(true);
    expect(
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(result.extraction),
      ),
    ).toBe(false);
  },
);

it("preserves compatibility policies moved out of the Requirements allocation", () => {
  const result = replay(sample("ASAP-SPEC"));
  const original = result.extraction.requirements.sourceText;
  const policy = original
    .split(/\n\s*\n/)
    .find((paragraph) =>
      /^This specialisation (?:may|can|must|is)/.test(paragraph),
    );
  expect(policy).toBeTruthy();
  expect(
    result.extraction.sections.some((section) =>
      section.markdown.includes(policy),
    ),
  ).toBe(true);
});

it("merges repeated areas of interest without losing either source value", () => {
  const entry = sample("ACCT-SPEC");
  const result = replay({
    ...entry,
    markdown:
      entry.markdown + "\n## Areas of Interest\nAccounting and research\n",
  });
  const fields = result.extraction.summaryFields.filter(
    (field) => field.key === "areas_of_interest",
  );
  expect(fields).toHaveLength(1);
  expect(fields[0].values).toContain("Accounting and research");
  expect(validateAcademicStructureExtraction(result.extraction).success).toBe(
    true,
  );
});

async function assess(code, selected) {
  const { structureDetailsFromWrite } =
    await import("../lib/coursemap/structure-version-view.ts");
  const { requirementTreeProgress, requirementNodeKey } =
    await import("../lib/coursemap/requirement-progress.ts");
  const content = compactStructureAdapter.project(
    replay(sample(code), { model: null }).extraction,
  );
  const root = structureDetailsFromWrite(content).requirements;
  const courses = selected.map((courseCode) => ({
    code: courseCode,
    name: courseCode,
    year: 2026,
    level: Number(courseCode[4]) * 1000,
    units: 6,
    subject: courseCode.slice(0, 4),
    sessions: [],
  }));
  const attempts = selected.map((courseCode, index) => ({
    id: String(index),
    courseCode,
    academicYear: 2026,
    termId: "2026-s1",
    status: "completed",
  }));
  return requirementTreeProgress({
    root,
    attempts,
    catalogue: { courses, terms: [] },
  }).get(requirementNodeKey(root));
}

it("Biology permits mixed advanced subjects while enforcing 24 units and the first-year cap", async () => {
  expect(
    (await assess("BIOL-MIN", ["BIOL1008", "BIOL1020", "BIOL2101", "MEDN3001"]))
      .state,
  ).toBe("satisfied");
  expect(
    (await assess("BIOL-MIN", ["BIOL2101", "MEDN3001", "NEUR3001", "BIOL3101"]))
      .state,
  ).toBe("satisfied");
  expect(
    (
      await assess("BIOL-MIN", [
        "BIOL1008",
        "BIOL1020",
        "BIOL2101",
        "MEDN3001",
        "NEUR3001",
      ])
    ).completedUnits,
  ).toBe(24);
  for (const codes of [
    ["BIOL1008", "BIOL1020", "BIOL2101"],
    ["BIOL1008", "BIOL1020", "BIOL1030", "MEDN3001"],
    ["BIOL1008", "BIOL1020", "BIOL2101", "COMP3001"],
    ["BIOL1008", "BIOL1020", "BIOL2101", "NEUR4001"],
  ])
    expect((await assess("BIOL-MIN", codes)).state).not.toBe("satisfied");
});

it("Advanced Physics retains the combined advanced pool and its named mathematics option", async () => {
  expect(
    (
      await assess("ADPH-SPEC", [
        "PHYS2001",
        "PHYS2002",
        "ASTR3001",
        "MATH3511",
      ])
    ).state,
  ).toBe("satisfied");
  expect(
    (
      await assess("ADPH-SPEC", [
        "PHYS3001",
        "PHYS3002",
        "ASTR3001",
        "ASTR3002",
      ])
    ).state,
  ).toBe("satisfied");
  for (const codes of [
    ["PHYS2001", "PHYS2002", "PHYS2003", "ASTR3001"],
    ["PHYS2001", "PHYS2002", "ASTR3001", "MATH3001"],
    ["PHYS2001", "PHYS2002", "ASTR2001", "MATH3511"],
  ])
    expect((await assess("ADPH-SPEC", codes)).state).not.toBe("satisfied");
});

it("Astronomy preserves both single-course choices and its six-course foundation", async () => {
  const foundation = [
    "ASTR2013",
    "ASTR3013",
    "MATH2305",
    "PHYS2013",
    "PHYS2016",
    "PHYS2020",
  ];
  expect(
    (await assess("ASTR-MAJ", [...foundation, "ASTR3002", "ASTR3005"])).state,
  ).toBe("satisfied");
  expect(
    (await assess("ASTR-MAJ", [...foundation, "ASTR3002", "ASTR3007"])).state,
  ).not.toBe("satisfied");
  expect(
    (await assess("ASTR-MAJ", [...foundation.slice(1), "ASTR3002", "ASTR3005"]))
      .state,
  ).not.toBe("satisfied");
});

it("Chemistry retains its compulsory course and each level's minimum", async () => {
  const advanced = ["CHEM3123", "CHEM3201", "CHEM3202", "CHEM3203", "CHEM3204"];
  expect(
    (
      await assess("CHEM-MAJ", [
        "CHEM2210",
        "CHEM2202",
        "CHEM2203",
        ...advanced,
      ])
    ).state,
  ).toBe("satisfied");
  expect(
    (
      await assess("CHEM-MAJ", [
        "CHEM2211",
        "CHEM2202",
        "CHEM2203",
        ...advanced,
      ])
    ).state,
  ).not.toBe("satisfied");
  expect(
    (
      await assess("CHEM-MAJ", [
        "CHEM2210",
        "CHEM2202",
        ...advanced,
        "CHEM3206",
      ])
    ).state,
  ).not.toBe("satisfied");
});

it.each(["ASTR-MAJ", "CHEM-MAJ"])(
  "retains first-year prerequisite guidance for %s",
  (code) => {
    const result = replay(sample(code), { model: null });
    const source = sample(code).markdown.split("## Requirements")[1];
    const preamble = source.trim().split(/\n\s*\n/)[0];
    expect(
      result.extraction.sections.some((section) =>
        section.markdown.includes(preamble),
      ),
    ).toBe(true);
    expect(result.extraction.requirements.sourceText).toContain(preamble);
    const altered = replay({
      ...sample(code),
      markdown: sample(code).markdown.replace(
        preamble,
        preamble +
          "\nStudents must complete an additional approved research project.",
      ),
    });
    expect(
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(altered.extraction),
      ),
    ).toBe(false);
  },
);

it.each([
  ["BIOL-MIN", "BIOL Biology", "BIOL Biology excluding approved courses"],
  ["BIOL-MIN", "BIOL Biology", "BIOL Biology subject to permission"],
  ["ADPH-SPEC", "MATH3511", "PHYS3511"],
  ["BIOL-MIN", "(6 units)", "(0 units)"],
])(
  "holds altered subject pools in %s instead of discarding qualifiers or overlapping options",
  (code, original, replacement) => {
    const entry = sample(code);
    expect(entry.markdown).toContain(original);
    const result = replay(
      { ...entry, markdown: entry.markdown.replace(original, replacement) },
      { model: null },
    );
    expect(
      sourceFirstPublicationEligible(
        compactStructureAdapter.project(result.extraction),
      ),
    ).toBe(false);
  },
);
