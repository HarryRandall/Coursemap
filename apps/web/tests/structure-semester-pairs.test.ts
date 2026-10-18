import { describe, expect, it } from "vitest";

import type { AcademicStructureRequirements } from "../lib/catalogue-import/kinds/structure/contract";
import { consecutiveSemesterReviewItems } from "../lib/catalogue-import/kinds/structure/semester-pairs";

function requirements(sourceText: string) {
  return { sourceText, rule: null } as unknown as AcademicStructureRequirements;
}

describe("consecutive-semester timing", () => {
  it("warns when one course is taken over consecutive semesters", () => {
    const [item] = consecutiveSemesterReviewItems(
      requirements(
        "24 units from ASTR4005 Research Thesis, taken over two consecutive semesters.",
      ),
    );
    expect(item).toMatchObject({ severity: "warning", kind: "unsupported" });
  });

  it("holds unmodelled timing between two courses", () => {
    const [item] = consecutiveSemesterReviewItems(
      requirements(
        "Students must take ENGN4200 and ENGN4201 in consecutive semesters.",
      ),
    );
    expect(item).toMatchObject({ severity: "error" });
  });

  it("warns when every named course is modelled as repeatable", () => {
    const [item] = consecutiveSemesterReviewItems({
      sourceText:
        "COMP3770 and COMP4550 must be completed twice, in consecutive semesters.",
      rule: {
        type: "condition",
        conditionKind: "course_list",
        courseCodes: ["COMP3770", "COMP4550"],
        repeatableCourses: [
          { courseCode: "COMP3770", maximumUnits: 12 },
          { courseCode: "COMP4550", maximumUnits: 24 },
        ],
      },
    } as unknown as AcademicStructureRequirements);
    expect(item).toMatchObject({ severity: "warning" });
  });
});
