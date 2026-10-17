import { describe, expect, it } from "vitest";
import {
  buildFeeEstimateTable,
  courseFeeEstimates,
  estimateFee,
  estimatedFeeAmount,
  feeEstimateNote,
  feePerUnit,
  type FeeReferenceCourse,
} from "../lib/academic/fee-estimates";
import { coursePrice, coursePrices } from "../lib/academic/fee-status";
import type { CourseFee } from "../lib/coursemap/course-types";

function reference(
  overrides: Partial<FeeReferenceCourse> & { domestic?: number | null },
): FeeReferenceCourse {
  const { domestic = null, ...rest } = overrides;
  return {
    year: 2026,
    academicCareer: "UGRD",
    college: "ANU College of Systems and Society",
    subject: "COMP",
    perUnit: { domestic, international: null },
    ...rest,
  };
}

/** `count` courses sharing a subject and college, priced per unit. */
function group(
  count: number,
  perUnit: number,
  overrides: Partial<FeeReferenceCourse> = {},
) {
  return Array.from({ length: count }, (_, index) =>
    reference({ domestic: perUnit + index, ...overrides }),
  );
}

const target = {
  year: 2026,
  academicCareer: "UGRD",
  college: "ANU College of Systems and Society",
  subject: "COMP",
};

describe("feePerUnit", () => {
  it("spreads a course fee over its fixed units and keeps a unit fee", () => {
    expect(feePerUnit({ amount: 4920, basis: "course", units: 6 })).toBe(820);
    expect(feePerUnit({ amount: 750, basis: "unit", units: null })).toBe(750);
  });

  it("leaves out fees it cannot express per unit", () => {
    expect(feePerUnit({ amount: 4920, basis: "course", units: null })).toBe(
      null,
    );
    expect(feePerUnit({ amount: 4920, basis: "unknown", units: 6 })).toBe(null);
    expect(feePerUnit({ amount: null, basis: "course", units: 6 })).toBe(null);
  });
});

describe("estimateFee", () => {
  it("prefers the same subject over the college and the career", () => {
    const table = buildFeeEstimateTable([
      ...group(5, 800),
      ...group(5, 900, { subject: "ENGN" }),
      ...group(5, 1000, { subject: "ARTS", college: "Arts" }),
    ]);
    // COMP per-unit fees are 800 to 804, so the median is 802.
    expect(estimateFee(table, target, "domestic")).toEqual({
      perUnit: 802,
      scope: "subject",
      scopeValue: "COMP",
      sampleSize: 5,
    });
  });

  it("falls back to the college, then the career, when a group is too small", () => {
    const table = buildFeeEstimateTable([
      ...group(4, 800),
      ...group(3, 900, { subject: "ENGN" }),
      ...group(5, 1000, { subject: "ARTS", college: "Arts" }),
    ]);
    expect(estimateFee(table, target, "domestic")).toMatchObject({
      scope: "college",
      sampleSize: 7,
    });
    expect(
      estimateFee(
        table,
        { ...target, subject: "MUSI", college: "Music" },
        "domestic",
      ),
    ).toMatchObject({ scope: "career", scopeValue: "UGRD", sampleSize: 12 });
  });

  it("returns null when no group has the minimum sample", () => {
    const table = buildFeeEstimateTable(group(4, 800));
    expect(estimateFee(table, target, "domestic")).toBe(null);
  });

  it("never mixes years, audiences or careers", () => {
    const table = buildFeeEstimateTable([
      ...group(6, 800, { year: 2025 }),
      ...group(6, 800, { academicCareer: "PGRD" }),
    ]);
    expect(estimateFee(table, target, "domestic")).toBe(null);
    expect(
      estimateFee(
        table,
        { ...target, academicCareer: "PGRD" },
        "international",
      ),
    ).toBe(null);
  });
});

describe("courseFeeEstimates", () => {
  const table = buildFeeEstimateTable(
    Array.from({ length: 5 }, () => ({
      ...reference({}),
      perUnit: { domestic: 800, international: 1200 },
    })),
  );

  it("estimates only the audiences without a listed fee", () => {
    expect(
      courseFeeEstimates(table, target, {
        domestic: false,
        international: true,
      }),
    ).toEqual({
      domestic: {
        perUnit: 800,
        scope: "subject",
        scopeValue: "COMP",
        sampleSize: 5,
      },
    });
    expect(
      courseFeeEstimates(table, target, {
        domestic: true,
        international: true,
      }),
    ).toBe(undefined);
  });
});

describe("pricing with estimates", () => {
  const estimate = {
    perUnit: 818,
    scope: "subject" as const,
    scopeValue: "COMP",
    sampleSize: 12,
  };
  const fee = (overrides: Partial<CourseFee>): CourseFee => ({
    amount: null,
    audience: "domestic",
    basis: "course",
    currency: "AUD",
    feeType: "tuition",
    feeYear: 2026,
    sourceLabel: null,
    sourceText: null,
    studentContributionBand: null,
    ...overrides,
  });

  it("never lets an estimate replace a listed fee", () => {
    const prices = coursePrices([fee({ amount: 5000 })], {
      domestic: estimate,
      international: estimate,
    });
    expect(prices.estimates).toEqual({ international: estimate });
    expect(
      coursePrice({
        prices,
        units: 6,
        feeStatus: "domestic_fee",
        commencementYear: null,
      }),
    ).toEqual({ amount: 5000, estimate: null });
  });

  it("prices a missing fee from the estimate, rounded to $10", () => {
    const prices = coursePrices(
      [fee({ audience: "international", amount: 7000 })],
      {
        domestic: estimate,
      },
    );
    expect(
      coursePrice({
        prices,
        units: 6,
        feeStatus: "domestic_fee",
        commencementYear: null,
      }),
    ).toEqual({ amount: 4910, estimate });
    expect(estimatedFeeAmount(estimate, 6)).toBe(4910);
  });

  it("does not estimate a Commonwealth supported place", () => {
    const prices = coursePrices([], { domestic: estimate });
    expect(
      coursePrice({
        prices,
        units: 6,
        feeStatus: "commonwealth_supported",
        commencementYear: null,
      }),
    ).toBe(null);
  });

  it("charges a per-unit fee for each unit taken", () => {
    const prices = coursePrices([fee({ amount: 750, basis: "unit" })]);
    expect(
      coursePrice({
        prices,
        units: 12,
        feeStatus: "domestic_fee",
        commencementYear: null,
      }),
    ).toEqual({ amount: 9000, estimate: null });
  });

  it("says where the estimate came from and that it is not official", () => {
    expect(feeEstimateNote(estimate)).toBe(
      "Estimated from the median of 12 similar COMP courses. ANU's page didn't list a fee we could read, so this isn't the official fee.",
    );
  });
});
