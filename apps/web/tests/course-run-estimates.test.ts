import { expect, it } from "vitest";
import { courseRunEstimate } from "../lib/catalogue-runs/estimates";
import { parseCourseRunOptions } from "../lib/catalogue-runs/options";

const options = {
  count: 100,
  model: "google/gemini-3.1-flash-lite",
  inputPrice: 0.25,
  outputPrice: 1.5,
  sampleCount: 0,
  averageCost: null,
};

it("distinguishes the provisional measured projection from the maximum allowance", () => {
  const result = courseRunEstimate(options);
  expect(result.minimumUsd).toBe(0);
  expect(result.estimatedUsd).toBeCloseTo(0.149325);
  expect(result.maximumUsd).toBeCloseTo(0.725);
  expect(result.estimateKind).toBe("provisional");
});

it("uses completed imports at current prices when a sample exists", () => {
  const result = courseRunEstimate({
    ...options,
    sampleCount: 20,
    averageCost: 0.0005,
  });
  expect(result.estimatedUsd).toBe(0.05);
  expect(result.estimateKind).toBe("measured");
});

it("does not transfer the single-course estimate to an unmeasured model", () => {
  expect(
    courseRunEstimate({ ...options, model: "other/model" }).estimatedUsd,
  ).toBeNull();
});

it("has no estimated or maximum spend when AI is disabled", () => {
  expect(courseRunEstimate({ ...options, allowAi: false })).toMatchObject({
    estimatedUsd: 0,
    maximumUsd: 0,
    estimateKind: "not_used",
  });
});

it("permits catalogue-wide selections and rejects invalid amounts", () => {
  expect(parseCourseRunOptions({ year: 2026, limit: 3500 }).limit).toBe(3500);
  expect(parseCourseRunOptions({ year: 2026, allowAi: false })).toMatchObject({
    allowAi: false,
    budgetUsd: 0,
  });
  expect(() => parseCourseRunOptions({ year: 2026, limit: 1.5 })).toThrow();
  expect(() => parseCourseRunOptions({ year: 2026, limit: 0 })).toThrow();
  expect(() =>
    parseCourseRunOptions({ year: 2026, budgetUsd: 0.001 }),
  ).toThrow();
  expect(
    parseCourseRunOptions({ year: 2026, budgetUsd: 0, allowAi: false }),
  ).toMatchObject({ allowAi: false, budgetUsd: 0 });
});

it("normalises an explicit code selection and rejects empty or malformed selections", () => {
  expect(
    parseCourseRunOptions({
      year: 2027,
      codes: [" stat1008 ", "STAT1008", "MATH1013"],
      allowAi: false,
    }).codes,
  ).toEqual(["STAT1008", "MATH1013"]);
  expect(parseCourseRunOptions({ year: 2027 }).codes).toBeUndefined();
  for (const codes of [
    [],
    [""],
    ["STAT1008 OR true"],
    ["BECE-MIN"],
    [42],
    "STAT1008",
  ]) {
    expect(() => parseCourseRunOptions({ year: 2027, codes })).toThrow(
      "valid catalogue codes",
    );
  }
  expect(
    parseCourseRunOptions({ year: 2027, kind: "minor", codes: ["bece-min"] })
      .codes,
  ).toEqual(["BECE-MIN"]);
});
