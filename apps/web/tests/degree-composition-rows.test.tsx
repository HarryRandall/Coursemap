import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DegreeComposition } from "@/ui/dashboard/degree-composition";

test("each part of the degree shows completed and planned units against its size", () => {
  render(
    <DegreeComposition
      academicYear={2026}
      sections={[
        {
          key: "core",
          kind: "core",
          structureName: null,
          targetUnits: 48,
          unchosen: false,
          courses: [
            {
              code: "COMP1100",
              name: "Programming",
              units: 6,
              status: "completed",
            },
            {
              code: "COMP1110",
              name: "Structured",
              units: 6,
              status: "planned",
            },
          ],
        },
        {
          key: "minor",
          kind: "minor",
          structureName: null,
          targetUnits: 24,
          unchosen: true,
          courses: [],
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("img", {
      name: "6 units completed and 6 planned of 48 units",
    }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /Programme core/ })).toHaveAttribute(
    "href",
    "/requirements?tab=programme",
  );
  expect(screen.getByRole("link", { name: /Add a minor/ })).toHaveAttribute(
    "href",
    "/requirements?tab=minor",
  );
});
