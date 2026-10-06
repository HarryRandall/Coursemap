import { expect, test } from "vitest";
import { requirementCourseCodes } from "../lib/coursemap/requirement-display";
import { structureCourseReferenceCodes } from "../lib/coursemap/structure-course-references";

test("display references include advice without adding it to required courses", () => {
  const requirements = {
    type: "group",
    children: [
      { type: "condition", options: [{ kind: "course", code: "FINM2001" }] },
    ],
  };
  expect(
    structureCourseReferenceCodes({
      requirements,
      introduction: "Prepare with MATH1014.",
      description: "MATH1116 is another option.",
      sections: [
        {
          markdown:
            "FINM2003 has been replaced by **FINM3011**. FINM2001 is required.",
        },
      ],
    }),
  ).toEqual(["FINM2001", "MATH1014", "MATH1116", "FINM2003", "FINM3011"]);
  expect(requirementCourseCodes(requirements)).toEqual(["FINM2001"]);
});

test("empty prose and requirements need no additional course reads", () => {
  expect(
    structureCourseReferenceCodes({
      requirements: null,
      introduction: null,
      description: null,
      sections: [],
    }),
  ).toEqual([]);
});
