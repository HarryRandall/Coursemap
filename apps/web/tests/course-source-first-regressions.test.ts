import { describe, expect, it } from "vitest";
import fixture from "./fixtures/course-import/anu-2026-source-first.json";
import art from "./fixtures/course-import/anu-2026-source-first-regressions.json";
import { compactCourseAdapter } from "../lib/catalogue-import/kinds/course/compact-adapter.ts";
import { parsePlainCourseRequisites } from "../lib/catalogue-import/kinds/course/plain-requisites.ts";
import { sourceFirstPublicationEligible } from "../lib/catalogue-runs/eligibility.ts";
import type { ClaimedCatalogueSync } from "../lib/catalogue-sync/sync-store.ts";

function candidate(code: string, markdown?: string) {
  const source = art.sources.find((x) => x.code === code)!;
  const result = compactCourseAdapter.finalise({
    claim: { code, academicYear: 2026 } as ClaimedCatalogueSync,
    listingTitle: null,
    model: { requisites: null },
    pageMarkdown: markdown ?? source.markdown,
    finishReason: "stop",
    responseError: null,
    context: fixture.context,
  });
  const content = compactCourseAdapter.project(result.extraction);
  if (!content.course) throw new Error("Expected a course candidate.");
  return { ...content, course: content.course };
}
describe("captured ANU arts and Asia source formats", () => {
  it.each([
    "ARTH3007",
    "ARTH3057",
    "ARTH4025",
    "ARTH4026",
    "ARTH4027",
    "ARTH8025",
    "ARTH8026",
    "ARTH8027",
  ])("verifies the complete candidate for %s", (code) => {
    const content = candidate(code);
    expect(content.flags).toEqual([]);
    expect(sourceFirstPublicationEligible(content)).toBe(true);
  });
  it.each(["ARTH4030", "ARTH6001"])(
    "retains unsupported applications for review: %s",
    (code) => {
      const content = candidate(code);
      expect(sourceFirstPublicationEligible(content)).toBe(false);
      expect(content.flags.some((x) => x.fieldPath === "requisites")).toBe(
        true,
      );
    },
  );
  it("preserves reading and integrated learning under labelled text", () => {
    const content = candidate("ARTH4025");
    expect(content.course.details.prescribedTexts).toContain(
      "Preliminary Reading",
    );
    expect(content.course.details.workloadText).toContain(
      "Work Integrated Learning",
    );
    expect(content.course.details.workloadText).toContain(
      "virtual/simulated professional experience",
    );
  });
  it("does not generalise the advisory template to quantified eligibility", () => {
    const source = art.sources.find((x) => x.code === "ARTH4025")!;
    const content = candidate(
      source.code,
      source.markdown.replace(
        "Students must be able and prepared to engage with art historical discourse and research at a level appropriate to the chosen course.",
        "Students must have completed 24 units of ARTH courses.",
      ),
    );
    expect(sourceFirstPublicationEligible(content)).toBe(false);
    expect(
      content.flags.some((x) => x.message.includes("mandatory eligibility")),
    ).toBe(true);
  });
  it("keeps the course conjunction outside the level alternatives and consent exception", () => {
    const text = art.sources
      .find((x) => x.code === "ARTH3007")!
      .markdown.split("## Requisite and Incompatibility\n")[1]!
      .split("## ")[0]!
      .trim();
    expect(parsePlainCourseRequisites(text)?.prerequisiteRule).toEqual({
      op: "one_of",
      rules: [
        {
          op: "all_of",
          rules: [
            {
              op: "all_of",
              rules: [
                { op: "completed", courseCode: "ARTH1006" },
                { op: "completed", courseCode: "ARTH1007" },
              ],
            },
            {
              op: "min_units_at_level",
              minimumUnits: 12,
              subjectCode: "ARTH",
              level: 2000,
              maximumLevel: 3000,
            },
          ],
        },
        { op: "permission", sourceText: "with permission of the convenor" },
      ],
    });
  });
  it("preserves programme alternatives and permission as alternatives", () => {
    const content = candidate("ARTH8025");
    expect(
      content.requirements.conditions
        .filter((x) => x.kind === "structure")
        .map((x) => x.itemCode),
    ).toEqual(["MAHST", "VAHST", "CSTUD", "MDIHU"]);
    expect(
      content.requirements.conditions.some((x) => x.kind === "permission"),
    ).toBe(true);
  });
  it("rejects trailing or ambiguous programme-list text", () => {
    const text =
      "To enrol in this course you must be studying one of the following programs, or with permission of the convener: Master of Art History (MAHST) Graduate Certificate of Studies (CSTUD)";
    expect(
      parsePlainCourseRequisites(text + " and have a GPA of 6."),
    ).toBeNull();
  });
});

it("does not invent scope for course alternatives before a unit threshold", () => {
  expect(
    parsePlainCourseRequisites(
      "To enrol in this course you must have completed ARTH1006 or ARTH1007 and 12 units of ARTH coded courses at 2000 or 3000 level.",
    ),
  ).toBeNull();
});
it("keeps completed and concurrent exclusions as separate scopes", () => {
  const parsed = parsePlainCourseRequisites(
    "You are not able to enrol in this course if you are enrolled in, or have previously completed ANUC1123, ARTV1020 or ARTV6020 (Figure & Life).",
  );
  expect(parsed?.incompatibilityCourseCodes).toEqual([
    "ANUC1123",
    "ARTV1020",
    "ARTV6020",
  ]);
  expect(parsed?.concurrentIncompatibilityCourseCodes).toEqual([
    "ANUC1123",
    "ARTV1020",
    "ARTV6020",
  ]);
  expect(
    parsePlainCourseRequisites(
      "You are not able to enrol in this course if you are enrolled in, or have previously completed ARTV1020 and ARTV6020.",
    ),
  ).toBeNull();
});
it.each(["ARTV1020", "ARTV1150"])(
  "verifies supporting notes without treating advice as an enrolment requirement: %s",
  (code) => {
    const content = candidate(code);
    expect(sourceFirstPublicationEligible(content)).toBe(true);
    expect(content.course.details.workloadText).toContain("Other Information");
    expect(content.course.details.workloadText).toContain("Materials Fee");
    expect(content.course.details.description).not.toContain("Materials Fee");
  },
);
it("holds a page containing only generic academic-integrity boilerplate", () => {
  const content = candidate("ARTS5920");
  expect(sourceFirstPublicationEligible(content)).toBe(false);
  expect(content.course.details.description).toBeNull();
  expect(content.flags.some((x) => x.fieldPath === "description")).toBe(true);
});

it.each(["ARTV2027", "ARTV2028"])(
  "verifies printed unit thresholds and consent without duplicate conditions: %s",
  (code) => {
    const content = candidate(code);
    expect(sourceFirstPublicationEligible(content)).toBe(true);
    expect(
      content.requirements.conditions.filter((x) => x.kind === "permission"),
    ).toHaveLength(1);
  },
);
it("keeps consent alternatives distinct from additional mandatory consent", () => {
  const parsed = parsePlainCourseRequisites(
    "To enrol in this course you must have completed 54 units towards an ANU degree, or with permission of the convenor. You will need to contact the School of Art and Design to request a permission code to enrol in this course.",
  );
  expect(parsed?.prerequisiteRule).toMatchObject({
    op: "all_of",
    rules: [{ op: "one_of" }, { op: "permission" }],
  });
});

it.each(["ARTV2066", "ARTV2150", "ARTV2350", "ARTV2550", "ARTV2650"])(
  "verifies captured unit conjunctions, exclusions and consent alternatives: %s",
  (code) => {
    const content = candidate(code);
    expect(content.flags).toEqual([]);
    expect(sourceFirstPublicationEligible(content)).toBe(true);
  },
);
it("does not treat resources marked required as mandatory entry qualifications", () => {
  const content = candidate("ARTV1020");
  expect(content.course.details.prescribedTexts).toContain(
    "All texts and resources required",
  );
  expect(content.course.details.workloadText).not.toContain(
    "safelinks.protection.outlook.com",
  );
  expect(sourceFirstPublicationEligible(content)).toBe(true);
});
it("keeps concurrent exclusions with their original conjunction and consent exception", () => {
  const parsed = parsePlainCourseRequisites(
    "To enrol in this course you must have completed ARTV1150, ARTV1101 or ARTV1102. Unless an arrangement has been made with the Course Convener, students may not enrol in this course if they have previously completed ARTV2117, ARTV2119, ARTV2120, ARTV2125 or ARTV2124.",
  );
  expect(parsed?.incompatibilityCourseCodes).toEqual([]);
  expect(parsed?.incompatibilityRule).toMatchObject({
    op: "one_of",
    rules: [
      {
        op: "all_of",
        rules: [
          { op: "not_completed", courseCode: "ARTV2117" },
          { op: "not_completed", courseCode: "ARTV2119" },
          { op: "not_completed", courseCode: "ARTV2120" },
          { op: "not_completed", courseCode: "ARTV2125" },
          { op: "not_completed", courseCode: "ARTV2124" },
        ],
      },
      { op: "permission" },
    ],
  });
});
it("preserves quantities and subjects in two mandatory unit thresholds", () => {
  expect(
    parsePlainCourseRequisites(
      "To enrol in this course you must have completed a minimum of 24 units of 1000-level Visual Arts (ARTV) courses and 6 units of an Art History (ARTH) course.",
    )?.prerequisiteRule,
  ).toEqual({
    op: "all_of",
    rules: [
      {
        op: "min_units_at_level",
        minimumUnits: 24,
        level: 1000,
        maximumLevel: 1000,
        subjectCode: "ARTV",
      },
      { op: "min_units_from_subject", minimumUnits: 6, subjectCode: "ARTH" },
    ],
  });
});

it.each(["ARTV2909", "ARTV2921"])(
  "verifies consecutive completed-unit requirements for %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(true);
  },
);
it("keeps the initial unit requirement outside the following permission exception", () => {
  const source = art.sources.find((x) => x.code === "ARTV2909")!;
  const text = source.markdown
    .split("## Requisite and Incompatibility")[1]!
    .split("## ")[0]!
    .trim();
  expect(parsePlainCourseRequisites(text)?.prerequisiteRule).toEqual({
    op: "all_of",
    rules: [
      { op: "min_units_total", minimumUnits: 48 },
      {
        op: "one_of",
        rules: [
          {
            op: "one_of",
            rules: [
              {
                op: "min_units_at_level",
                minimumUnits: 6,
                level: 2000,
                maximumLevel: 2000,
                subjectCode: "ARTV",
              },
              {
                op: "min_units_at_level",
                minimumUnits: 6,
                level: 2000,
                maximumLevel: 2000,
                subjectCode: "DESN",
              },
            ],
          },
          { op: "permission", sourceText: "with permission of the Convener" },
        ],
      },
    ],
  });
});
it.each(["ARTV3033", "ARTV3034"])(
  "holds unsupported degree-specific requirements for %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(false);
  },
);

it("preserves programme enrolment and completed course as a conjunction", () => {
  expect(sourceFirstPublicationEligible(candidate("ARTV4023"))).toBe(true);
  expect(
    parsePlainCourseRequisites(
      "To enrol in this course you must be enrolled in the Bachelor of Visual Arts (Honours) (HVART) and have completed ARTV4022.",
    )?.prerequisiteRule,
  ).toEqual({
    op: "all_of",
    rules: [
      { op: "enrolled_in", programmeCode: "HVART" },
      { op: "completed", courseCode: "ARTV4022" },
    ],
  });
});
it.each(["ARTV2850", "ARTV3035", "ARTV8038", "ARTV8039"])(
  "retains unsupported scope or mandatory project conditions for %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(false);
  },
);

it("preserves explicitly optional recommended knowledge without a mandatory review flag", () => {
  const content = candidate("ASIA1030");
  expect(sourceFirstPublicationEligible(content)).toBe(true);
  expect(JSON.stringify(content.requirements)).toContain(
    "recommended but not required",
  );
  const source = art.sources.find((x) => x.code === "ASIA1030")!;
  expect(
    sourceFirstPublicationEligible(
      candidate(
        "ASIA1030",
        source.markdown.replace("recommended but not required", "required"),
      ),
    ),
  ).toBe(false);
});

it.each(["ASIA2001", "ASIA2003", "ASIA2006", "ASIA2009", "ASIA2014"])(
  "verifies university-unit totals and unconditional exclusions for %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(true);
  },
);
it("preserves all independently excluded courses and additional interest labels", () => {
  const content = candidate("ASIA2001");
  expect(content.course.areasOfInterest.map((item) => item.name)).toContain(
    "Asian Languages",
  );
  expect(
    parsePlainCourseRequisites(
      "To enrol in this course you must have successfully completed at least 24 units of university courses. This course is incompatible with ASIA2103 and ASIA8051.",
    )?.incompatibilityCourseCodes,
  ).toEqual(["ASIA2103", "ASIA8051"]);
});

it.each(["ASIA2017", "ASIA2031"])(
  "verifies enrolment advice and explicitly unnecessary knowledge for %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(true);
  },
);
it("retains enrolment help without inventing a permission alternative", () => {
  const content = candidate("ASIA2017");
  expect(content.course.details.workloadText).toContain(
    "cap.student@anu.edu.au",
  );
  expect(
    content.requirements.conditions.some((x) => x.kind === "permission"),
  ).toBe(false);
});

const heldSources = new Set([
  "ARTH4030",
  "ARTH6001",
  "ARTH8030",
  "ARTS5920",
  "ARTS8001",
  "ARTV1034",
  "ARTV3033",
  "ARTV3034",
  "ARTV3035",
  "ARTV8038",
  "ARTV8039",
  "ARTV2850",
  "ARTV9030",
]);
it.each(art.sources.map((x) => x.code))(
  "checks the complete sequential canary source: %s",
  (code) => {
    expect(sourceFirstPublicationEligible(candidate(code))).toBe(
      !heldSources.has(code),
    );
  },
);
