import { describe, expect, it } from "vitest";
import { sampleSurveyResults } from "./fixtures/selt-chart-samples";
import {
  agreementInterval,
  median,
  sessionMedians,
  surveyShortLabel,
  themeSummaries,
} from "../lib/course-surveys/survey-results";

describe("course survey results", () => {
  it("takes the median of odd and even length lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it("widens the agreement interval for small samples and keeps it in range", () => {
    expect(agreementInterval(76, 38)).toEqual({ low: 63, high: 85 });
    expect(agreementInterval(23, 84)).toEqual({ low: 16, high: 31 });
    expect(agreementInterval(100, 10)).toEqual({ low: 79, high: 100 });
    expect(agreementInterval(50, 0)).toEqual({ low: 0, high: 100 });
  });

  it("summarises each theme against its own history", () => {
    const results = sampleSurveyResults("COMP1730")!;
    const overall = themeSummaries(results).find(
      (summary) => summary.key === "overall_learning_experience",
    );
    expect(overall).toMatchObject({ latest: 76, median: 70, min: 44, max: 76 });
    expect(surveyShortLabel(results.surveys[0])).toBe("S1 19");
  });

  it("compares semesters only when a course runs in both", () => {
    expect(sessionMedians(sampleSurveyResults("COMP1730")!)).toEqual({
      sem1: 67.5,
      sem2: 71,
    });
    expect(sessionMedians(sampleSurveyResults("COMP2310")!)).toBeNull();
    expect(sampleSurveyResults("MATH1013")).toBeNull();
  });
});
