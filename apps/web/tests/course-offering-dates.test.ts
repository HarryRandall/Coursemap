import { describe, expect, it } from "vitest";

import type { CourseExtractionValidationIssue } from "../lib/catalogue-import/kinds/course/contract";
import { validateCourseOfferings } from "../lib/catalogue-import/kinds/course/offering-validation";

function offeringIssues(periodCode: string) {
  const issues: CourseExtractionValidationIssue[] = [];
  validateCourseOfferings(
    {
      offerings: [
        {
          position: 1,
          calendarYear: 2026,
          periodCode,
          periodName: "Summer Session",
          classNumber: "1410",
          startsOn: "2025-12-01",
          endsOn: "2026-02-20",
          lastEnrolmentDate: "2025-12-02",
          censusDate: "2026-01-09",
          deliveryMode: "In Person",
          location: null,
          classSummaryUrl: null,
          sourceText:
            "| 1410 | 01 Dec 2025 | 02 Dec 2025 | 09 Jan 2026 | 20 Feb 2026 |",
        },
      ],
    },
    issues,
    { knownPeriodCodes: [periodCode] },
  );
  return issues.filter(({ path }) => /startsOn|lastEnrolmentDate/u.test(path));
}

describe("offering calendar years", () => {
  it("accepts a Summer Session that starts the December before", () => {
    expect(offeringIssues("SUMMER")).toEqual([]);
  });

  it("still rejects another period that starts the year before", () => {
    expect(offeringIssues("S1").length).toBeGreaterThan(0);
  });
});
