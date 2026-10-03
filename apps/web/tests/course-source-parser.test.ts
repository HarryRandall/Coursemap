import { describe, expect, it } from "vitest";
import fixture from "./fixtures/course-import/anu-2026-source-first.json";
import { parseCourseSource } from "../lib/catalogue-import/kinds/course/source-parser.ts";
import { validateCourseExtraction } from "../lib/catalogue-import/kinds/course/contract.ts";
import { courseRunAllowance } from "../lib/catalogue-runs/budget.ts";

const parse = (code: string, markdown?: string) =>
  parseCourseSource({
    code,
    year: 2026,
    markdown:
      markdown ??
      fixture.sources.find((source) => source.code === code)!.markdown,
    context: fixture.context,
  });

describe("source-first course parsing", () => {
  it.each(fixture.sources)(
    "copies a complete valid contract for $code",
    (source) => {
      const course = parse(source.code);
      const result = validateCourseExtraction(course, {
        expectedCode: source.code,
        expectedYear: 2026,
        knownPeriodCodes: fixture.context.knownAcademicPeriods.map(
          (period) => period.code,
        ),
        knownTags: fixture.context.knownTags,
      });
      expect(result.issues).toEqual([]);
      expect(course.unitValue).toEqual({ kind: "fixed", units: 6 });
      expect(course.title).not.toEqual(source.code);
      expect(course.offerings.length).toBeGreaterThan(0);
      expect(
        course.offerings.every((offering) => offering.calendarYear === 2026),
      ).toBe(true);
      expect(
        course.evidence.every((item) => item.method === "deterministic"),
      ).toBe(true);
      expect(course.requisites.prerequisiteRule).toBeNull();
    },
  );
  it("copies fees and dates from source without model output", () => {
    const course = parse("ECON2108");
    expect(
      course.fees
        .filter((fee) => fee.feeType === "tuition")
        .map((fee) => fee.amount),
    ).toEqual([5520, 7020]);
    expect(course.offerings[0]).toMatchObject({
      periodCode: "S1",
      startsOn: "2026-02-23",
      endsOn: "2026-05-29",
      classNumber: "3641",
    });
    expect(course.learningOutcomes).toHaveLength(4);
    expect(course.description).toContain("Japanese economy");
  });
  it("maps ANU semester names to the configured calendar codes", () => {
    const markdown = fixture.sources.find(
      (source) => source.code === "ECON2108",
    )!.markdown;
    const course = parseCourseSource({
      code: "ECON2108",
      year: 2026,
      markdown,
      context: {
        ...fixture.context,
        knownAcademicPeriods: fixture.context.knownAcademicPeriods.map(
          (period) => ({
            ...period,
            name:
              period.code === "S1"
                ? "Semester 1"
                : period.code === "S2"
                  ? "Semester 2"
                  : period.name,
          }),
        ),
      },
    });
    expect(course.offerings[0]?.periodCode).toBe("S1");
    expect(
      course.reviewItems.some((item) =>
        item.message.includes("calendar identity"),
      ),
    ).toBe(false);
  });
  it("holds missing layouts rather than inventing course facts", () => {
    const course = parse(
      "ECON2108",
      "# Japanese Economy\n- Unit Value unknown\n",
    );
    expect(course.offeringStatus).toBe("unknown");
    expect(course.unitValue).toEqual({ kind: "unknown" });
    expect(course.reviewItems.map((item) => item.fieldKey)).toContain(
      "offerings",
    );
    expect(course.reviewItems.every((item) => item.severity === "error")).toBe(
      true,
    );
  });
  it("does not turn generic graduate attributes into degree tags", () => {
    expect(parse("ECON2108").tags).not.toContain(
      "Transdisciplinary Problem-Solving",
    );
  });
});

describe("course run budget bounds", () => {
  it("uses cold input and maximum output rather than the pilot average", () => {
    expect(courseRunAllowance(0.25, 1.5)).toBe(0.00725);
  });
  it("rejects unknown or invalid prices", () => {
    expect(() => courseRunAllowance(NaN, 1)).toThrow();
    expect(() => courseRunAllowance(-1, 1)).toThrow();
  });
});

describe("ANU contribution-band codes", () => {
  it.each(["1", "2", "3", "4", "12", "14", "34", "4B"])(
    "preserves recognised cohort code %s without choosing a student rate",
    (code) => {
      const md = fixture.sources[0]!.markdown.replace(
        /\*\*Student Contribution Band:\*\* \[[A-Z0-9]+\]/u,
        `**Student Contribution Band:** [${code}]`,
      );
      const result = parse(fixture.sources[0]!.code, md);
      const fee = result.fees.find(
        (x) => x.feeType === "student_contribution",
      )!;
      expect(fee.studentContributionBand).toBe(
        code === "4B" ? null : Number(code),
      );
      expect(fee.amount).toBeNull();
      expect(fee.sourceLabel).toBe(`Student Contribution Band Code ${code}`);
      expect(
        result.reviewItems.some(
          (x) => x.fieldKey === "fees.studentContributionBand",
        ),
      ).toBe(false);
    },
  );
  it("holds unrecognised codes rather than coercing them into known bands", () => {
    const md = fixture.sources[0]!.markdown.replace(
      /\*\*Student Contribution Band:\*\* \[[A-Z0-9]+\]/u,
      "**Student Contribution Band:** [99]",
    );
    const result = parse(fixture.sources[0]!.code, md);
    expect(
      result.fees.find((x) => x.feeType === "student_contribution")
        ?.studentContributionBand,
    ).toBeNull();
    expect(
      result.reviewItems.some(
        (x) => x.fieldKey === "fees.studentContributionBand",
      ),
    ).toBe(true);
  });
});
