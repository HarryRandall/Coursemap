import { expect, test } from "vitest";
import { enrolmentModeForProgramme } from "@/lib/academic/enrolment-mode";

test("the enrolment mode follows from how ANU publishes the programme", () => {
  expect(
    enrolmentModeForProgramme({
      code: "4050FDD",
      name: "Flexible Double Degree - Arts, Social Sciences, Business, Science",
    }),
  ).toBe("flexible_double_degree");
  expect(
    enrolmentModeForProgramme({
      code: "APNSC",
      name: "Bachelor of Philosophy (Honours) / Bachelor of Science (Honours)",
    }),
  ).toBe("fixed_double_degree");
  expect(
    enrolmentModeForProgramme({ code: "BCOMP", name: "Bachelor of Computing" }),
  ).toBe("single_degree");
  // A slash elsewhere in a name is not a second award.
  expect(
    enrolmentModeForProgramme({
      code: "BTEST",
      name: "Bachelor of Science (Psychology/Neuroscience)",
    }),
  ).toBe("single_degree");
});
