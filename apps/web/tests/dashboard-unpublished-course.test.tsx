import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Dashboard } from "@/app/dashboard/dashboard";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const attempts: Attempt[] = [
  {
    id: "unpublished-course",
    courseCode: "COMP1100",
    termId: "2026-s1",
    academicYear: 2026,
    status: "planned",
    isPublished: false,
  },
];

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: {
        degreeCode: "BCOMP",
        commencementYear: 2026,
        extensionYears: 0,
        majorCode: "",
        minorCodes: [],
        specialisationCodes: [],
      },
      attempts,
    },
  }),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const catalogue: PlanCatalogue = {
  academicYear: 2026,
  courses: courses.map((course) => ({ ...course, year: 2026 })),
  terms,
  majors: [],
  structures: [],
  programmeRequirementsImported: false,
  structureRequirements: [],
  degrees: [
    {
      code: "BCOMP",
      name: "Computing",
      duration: 3,
      units: 144,
      college: "",
      description: "",
    },
  ],
};

test("a planned course that is no longer published is listed on the dashboard", async () => {
  render(
    <Dashboard
      catalogue={catalogue}
      choices={{
        catalogueYears: [],
        degrees: [],
        majors: [],
        minors: [],
        specialisations: [],
      }}
      keyDates={[]}
      todayIso="2026-03-01"
    />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Courses" }));
  const row = screen.getByRole("row", { name: /COMP1100/ });
  // The course name and its status both say so.
  expect(within(row).getAllByText("No longer published")).toHaveLength(2);
});
