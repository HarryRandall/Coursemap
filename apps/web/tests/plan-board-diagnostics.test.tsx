import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanBoard } from "@/ui/plan/plan-board";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const fixtures = vi.hoisted(() => ({ attempts: [] as Attempt[] }));

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: {
        degreeCode: "BCOMP",
        commencementYear: 2026,
        extensionYears: 0,
      },
      attempts: fixtures.attempts,
    },
    reorderAttempt: vi.fn(),
    notify: vi.fn(),
  }),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/ui/overlays", () => ({
  CourseDialog: () => null,
  CoursePicker: () => null,
}));
const catalogue: PlanCatalogue = {
  academicYear: 2026,
  courses: [],
  terms: [],
  majors: [],
  structures: [],
  programmeRequirementsImported: false,
  structureRequirements: [],
  degrees: [
    {
      code: "BCOMP",
      name: "Computing",
      duration: null,
      units: 144,
      college: "",
      description: "",
    },
  ],
};

test("a programme with units but no duration still offers three planning years without a data warning", () => {
  fixtures.attempts = [];
  render(<PlanBoard catalogue={catalogue} />);
  expect(screen.getByRole("tab", { name: /Year 3/ })).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: /Add course/ }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.queryByText(
      /planning data is incomplete|duration is not recorded|administrator/i,
    ),
  ).not.toBeInTheDocument();
});

test("withdrawn history does not occupy a course slot or units on the board", () => {
  fixtures.attempts = [
    {
      id: "withdrawn-course",
      courseCode: "COMP1100",
      termId: "2026-s1",
      academicYear: 2026,
      status: "withdrawn",
      unitsAttempted: 6,
      unitsEarned: 0,
      resultCode: "WD",
    },
  ];
  render(<PlanBoard catalogue={{ ...catalogue, courses, terms }} />);
  expect(screen.queryByText("COMP1100")).not.toBeInTheDocument();
  expect(screen.getByTestId("term-2026-s1")).toHaveTextContent("0 / 24 units");
});
