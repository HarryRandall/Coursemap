import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  emptyCourseExtraction,
  finaliseCourseExtraction,
} from "../lib/catalogue-import/kinds/course/finalise.ts";
import { courseKindAdapter } from "../lib/catalogue-import/kinds/course/adapter.ts";
import { classifyFirstRead } from "../lib/catalogue/first-read.ts";

type CapturedSource = {
  code: string;
  year: number;
  requisiteMarkdown: string;
};

const sources: CapturedSource[] = JSON.parse(
  await readFile(
    new URL(
      "./fixtures/course-import/anu-2026-requisite-scope.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function finaliseGuessedRule(source: CapturedSource) {
  const model = emptyCourseExtraction({
    code: source.code,
    year: source.year,
    title: source.code,
  });
  model.requisites.prerequisiteText = source.requisiteMarkdown
    .replace(/^## [^\n]+\n+/u, "")
    .trim();
  model.requisites.prerequisiteRule = {
    op: "completed",
    courseCode: "FINM1001",
  };
  model.overallConfidence = 1;
  const outcome = finaliseCourseExtraction({
    code: source.code,
    year: source.year,
    listingTitle: source.code,
    model,
    pageMarkdown: source.requisiteMarkdown,
    finishReason: "stop",
    responseError: null,
  });
  return { outcome, model };
}

describe("source prerequisite scope", () => {
  it.each(
    sources.filter(({ code }) => ["ECON2108", "STAT2014"].includes(code)),
  )(
    "withholds a confident guessed rule for $code and blocks publication review",
    (source) => {
      const { outcome, model } = finaliseGuessedRule(source);
      expect(outcome.extraction.requisites.prerequisiteRule).toBeNull();
      expect(outcome.extraction.requisites.unmodelledText).toHaveLength(1);
      expect(source.requisiteMarkdown).toContain(
        outcome.extraction.requisites.unmodelledText[0],
      );
      expect(outcome.report.unscopedPrerequisiteClauses).toHaveLength(1);
      expect(outcome.errorCount).toBeGreaterThan(0);
      expect(model.requisites.prerequisiteRule).not.toBeNull();
      const content = courseKindAdapter.project(outcome.extraction);
      expect(content.flags).toContainEqual(
        expect.objectContaining({
          fieldPath: "requisites.prerequisiteRule",
          severity: "error",
        }),
      );
      expect(classifyFirstRead(content)).toContainEqual(
        expect.objectContaining({
          fieldPath: "requirements.prerequisite",
          band: "needs_review",
        }),
      );
    },
  );

  it.each(
    sources.filter(({ code }) => !["ECON2108", "STAT2014"].includes(code)),
  )("does not flag $code's source as an unscoped conjunction", (source) => {
    const { outcome } = finaliseGuessedRule(source);
    expect(outcome.report.unscopedPrerequisiteClauses).toEqual([]);
    expect(outcome.extraction.requisites.prerequisiteRule).not.toBeNull();
  });

  it("does not treat a separate incompatibility or assumed-knowledge sentence as prerequisite scope", () => {
    const { outcome } = finaliseGuessedRule({
      code: "FINM3005",
      year: 2026,
      requisiteMarkdown:
        "## Requisite and Incompatibility\n\nYou must have completed FINM2001 and BUSN1001. Incompatible with ECON2102 or ECON2112.\n\n## Assumed Knowledge\n\nStudents should have completed ECON1101 and ECON1102 or ECON1100.\n",
    });
    expect(outcome.report.unscopedPrerequisiteClauses).toEqual([]);
  });

  it("retains an ambiguous clause when its source sentence wraps onto another line", () => {
    const clause =
      "You must have completed ECON1101 and\nECON1102 or ECON1100.";
    const { outcome } = finaliseGuessedRule({
      code: "ECON2108",
      year: 2026,
      requisiteMarkdown: `## Requisite and Incompatibility\n\n${clause}\n`,
    });
    expect(outcome.extraction.requisites.prerequisiteRule).toBeNull();
    expect(outcome.extraction.requisites.unmodelledText).toEqual([clause]);
  });
});

describe("comma-separated prerequisite clauses", () => {
  it("keeps a rule whose clauses a comma separates", () => {
    const requisiteMarkdown =
      "## Requisite and Incompatibility\n\nTo enrol in this course you must have completed STAT2001 or STAT2013, and have completed MATH1113 or MATH1014 or MATH1116.\n";
    const model = emptyCourseExtraction({
      code: "STAT4027",
      year: 2026,
      title: "STAT4027",
    });
    model.requisites.prerequisiteText = requisiteMarkdown
      .replace(/^## [^\n]+\n+/u, "")
      .trim();
    model.requisites.prerequisiteRule = {
      op: "all_of",
      rules: [
        {
          op: "one_of",
          rules: [
            { op: "completed", courseCode: "STAT2001" },
            { op: "completed", courseCode: "STAT2013" },
          ],
        },
        {
          op: "one_of",
          rules: [
            { op: "completed", courseCode: "MATH1113" },
            { op: "completed", courseCode: "MATH1014" },
            { op: "completed", courseCode: "MATH1116" },
          ],
        },
        { op: "permission", sourceText: "with permission" },
      ],
    };
    model.overallConfidence = 1;
    const outcome = finaliseCourseExtraction({
      code: "STAT4027",
      year: 2026,
      listingTitle: "STAT4027",
      model,
      pageMarkdown: requisiteMarkdown,
      finishReason: "stop",
      responseError: null,
    });
    expect(outcome.extraction.requisites.prerequisiteRule).not.toBeNull();
    expect(outcome.extraction.requisites.unmodelledText).toHaveLength(0);
  });
});

describe("independently checked scope", () => {
  it("keeps an agent rule the plain-conjunction guess would withhold", () => {
    const requisiteMarkdown =
      "## Requisite and Incompatibility\n\nTo enrol in this course you must have completed STAT6039 or STAT7039 or STAT6013 and have completed STAT6038 or STAT7038.\n";
    const finalise = (checkedScope: boolean) => {
      const model = emptyCourseExtraction({
        code: "STAT6016",
        year: 2026,
        title: "STAT6016",
      });
      model.requisites.prerequisiteText = requisiteMarkdown
        .replace(/^## [^\n]+\n+/u, "")
        .trim();
      model.requisites.prerequisiteRule = {
        op: "all_of",
        rules: [
          {
            op: "one_of",
            rules: ["STAT6039", "STAT7039", "STAT6013"].map((courseCode) => ({
              op: "completed" as const,
              courseCode,
            })),
          },
          {
            op: "one_of",
            rules: ["STAT6038", "STAT7038"].map((courseCode) => ({
              op: "completed" as const,
              courseCode,
            })),
          },
          { op: "permission", sourceText: "with permission" },
        ],
      };
      model.overallConfidence = 1;
      return finaliseCourseExtraction({
        code: "STAT6016",
        year: 2026,
        listingTitle: "STAT6016",
        model,
        pageMarkdown: requisiteMarkdown,
        finishReason: "stop",
        responseError: null,
        checkedScope,
      }).extraction.requisites.prerequisiteRule;
    };
    expect(finalise(false)).toBeNull();
    expect(finalise(true)).not.toBeNull();
  });
});
