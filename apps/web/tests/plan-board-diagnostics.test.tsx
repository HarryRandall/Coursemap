import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { PlanBoard } from "@/ui/plan/plan-board";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const fixtures = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  starredCourses: [] as string[],
  extensionYears: 0,
  addCourse: vi.fn(async () => ({ ok: true })),
  setPlanExtensionYears: vi.fn(async () => ({ ok: true, message: "" })),
}));

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: {
        degreeCode: "BCOMP",
        commencementYear: 2026,
        extensionYears: fixtures.extensionYears,
      },
      attempts: fixtures.attempts,
      starredCourses: fixtures.starredCourses,
    },
    addCourse: fixtures.addCourse,
    setPlanExtensionYears: fixtures.setPlanExtensionYears,
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

test("a year shows its two semesters, and adding a session opens it without choosing a course", () => {
  fixtures.attempts = [];
  render(<PlanBoard catalogue={catalogue} />);
  expect(screen.getByRole("tab", { name: /Year 1/ })).toHaveTextContent(
    "0 / 48 units",
  );
  expect(screen.getAllByTestId(/term-2026-/)).toHaveLength(2);
  expect(screen.queryByTestId("term-2026-autumn")).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: /Add Autumn Session 2026/ }),
  );

  expect(screen.getByTestId("term-2026-autumn")).toHaveTextContent("0 units");
  expect(
    screen.queryByRole("button", { name: /Add Autumn Session 2026/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Autumn Session 2026" }),
  );
  expect(screen.queryByTestId("term-2026-autumn")).not.toBeInTheDocument();
});

test("a short session that holds a course shows without being added", () => {
  fixtures.attempts = [
    {
      id: "summer-course",
      courseCode: "COMP1100",
      termId: "2026-summer",
      academicYear: 2026,
      status: "planned",
    },
  ];
  render(
    <TooltipProvider>
      <PlanBoard catalogue={{ ...catalogue, courses }} />
    </TooltipProvider>,
  );
  expect(screen.getByTestId("term-2026-summer")).toHaveTextContent("COMP1100");
  expect(
    screen.queryByRole("button", { name: "Remove Summer Session 2026" }),
  ).not.toBeInTheDocument();
});

test("there is no Later year, and Add year extends the plan by one year", async () => {
  fixtures.attempts = [];
  fixtures.setPlanExtensionYears.mockClear();
  render(<PlanBoard catalogue={catalogue} />);
  expect(screen.queryByRole("tab", { name: /Later/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Add year/ }));
  await waitFor(() =>
    expect(fixtures.setPlanExtensionYears).toHaveBeenCalledWith(1),
  );
});

test("an added year can be removed again while it is empty", async () => {
  fixtures.attempts = [];
  fixtures.extensionYears = 1;
  fixtures.setPlanExtensionYears.mockClear();
  render(<PlanBoard catalogue={catalogue} />);
  fireEvent.click(screen.getByRole("tab", { name: /Year 4/ }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Year 4" }));
  await waitFor(() =>
    expect(fixtures.setPlanExtensionYears).toHaveBeenCalledWith(0),
  );
  fixtures.extensionYears = 0;
});

test("unscheduled courses wait in their own lane above the semesters", () => {
  fixtures.attempts = [
    {
      id: "unscheduled-course",
      courseCode: "COMP1100",
      termId: "unscheduled",
      academicYear: 2026,
      status: "planned",
    },
  ];
  render(
    <TooltipProvider>
      <PlanBoard
        catalogue={{
          ...catalogue,
          courses,
          terms: [
            ...terms,
            {
              id: "unscheduled",
              year: 2026,
              name: "Later",
              shortName: "Later",
              dates: "",
            },
          ],
        }}
      />
    </TooltipProvider>,
  );
  expect(screen.getByTestId("term-unscheduled")).toHaveTextContent(
    "Not scheduled yet",
  );
  expect(screen.getByTestId("term-unscheduled")).toHaveTextContent("COMP1100");
});

test("a starred course added to the open year lands in a semester it runs in", async () => {
  fixtures.attempts = [];
  fixtures.starredCourses = ["COMP1100"];
  fixtures.addCourse.mockClear();
  render(<PlanBoard catalogue={{ ...catalogue, courses, terms }} />);
  fireEvent.click(screen.getByRole("tab", { name: /Starred/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add COMP1100 to this year" }),
  );
  await waitFor(() =>
    expect(fixtures.addCourse).toHaveBeenCalledWith(
      "COMP1100",
      "2026-s1",
      2026,
    ),
  );
  fixtures.starredCourses = [];
});
