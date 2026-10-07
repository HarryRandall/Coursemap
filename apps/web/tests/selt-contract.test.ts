import { expect, it } from "vitest";
import { seltReportSchema, SELT_METRICS } from "../lib/selt/contract";
import { syntheticSeltReport } from "./fixtures/selt/report";
it("accepts a complete quantitative report with provenance", () => {
  expect(seltReportSchema.safeParse(syntheticSeltReport()).success).toBe(true);
});
it("rejects mismatched course identities and duplicated survey periods", () => {
  const report = syntheticSeltReport();
  report.report.course_code = "COMP2310";
  expect(seltReportSchema.safeParse(report).success).toBe(false);
  report.report.course_code = "TEST1234";
  report.surveys.push({ ...report.surveys[0]! });
  expect(seltReportSchema.safeParse(report).success).toBe(false);
});
it("preserves suppressed metrics as null and refuses populated small cohorts", () => {
  const report = syntheticSeltReport();
  report.surveys[0]!.respondents = 4;
  expect(seltReportSchema.safeParse(report).success).toBe(false);
  for (const metric of SELT_METRICS)
    report.surveys[0]!.agreement_percent[metric] = null;
  expect(seltReportSchema.safeParse(report).success).toBe(true);
});
it("rejects out-of-range metrics, impossible response counts and unknown fields", () => {
  const report = syntheticSeltReport();
  report.surveys[0]!.agreement_percent.feedback = 101;
  expect(seltReportSchema.safeParse(report).success).toBe(false);
  report.surveys[0]!.agreement_percent.feedback = 50;
  report.surveys[0]!.respondents = 101;
  expect(seltReportSchema.safeParse(report).success).toBe(false);
  expect(
    seltReportSchema.safeParse({
      ...syntheticSeltReport(),
      authorization: "must never be accepted",
    }).success,
  ).toBe(false);
});
