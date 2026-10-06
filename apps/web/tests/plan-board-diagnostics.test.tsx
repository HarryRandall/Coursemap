import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanBoard } from "@/ui/plan/plan-board";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const fixtures = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  starredCourses: [] as string[],
  addCourse: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: {
        degreeCode: "BCOMP",
        commencementYear: 2026,
        extensionYears: 0,
      },
      attempts: fixtures.attempts,
      starredCourses: fixtures.starredCourses,
    },
    addCourse: fixtures.addCourse,
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

test("short sessions share a lane without inflating the standard year target", () => {
  fixtures.attempts = [];
  render(<PlanBoard catalogue={catalogue} />);
  expect(screen.getByRole("tab", { name: /Year 1/ })).toHaveTextContent(
    "0 / 48 units",
  );
  expect(screen.getAllByTestId(/term-.*-s[12]$/)).toHaveLength(2);
  expect(screen.getByTestId("short-sessions")).toHaveTextContent("Summer");
  expect(
    screen.getByRole("button", {
      name: "Add a course to a 2026 short session",
    }),
  ).toBeVisible();
});

test("starred courses can be added to Later without selecting a teaching session", async () => {
  fixtures.attempts = [];
  fixtures.starredCourses = ["COMP1100"];
  fixtures.addCourse.mockClear();
  render(<PlanBoard catalogue={{ ...catalogue, courses, terms }} />);
  fireEvent.click(screen.getByRole("tab", { name: /Later/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Starred/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add COMP1100 to this year" }),
  );
  await waitFor(() =>
    expect(fixtures.addCourse).toHaveBeenCalledWith(
      "COMP1100",
      "unscheduled",
      2026,
    ),
  );
  fixtures.starredCourses = [];
});
