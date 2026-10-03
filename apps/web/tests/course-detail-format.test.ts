import { expect, it } from "vitest";
import { hasInherentRequirements } from "../ui/courses/course-detail-format";

it.each([
  null,
  undefined,
  "",
  "  ",
  "Not applicable.",
  "not applicable",
  "N/A",
  "None",
  "--",
])("hides empty inherent requirements: %s", (value) => {
  expect(hasInherentRequirements(value)).toBe(false);
});
it("preserves substantive inherent requirements", () => {
  expect(
    hasInherentRequirements(
      "Students must be able to work safely in a laboratory.",
    ),
  ).toBe(true);
});
