import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { planningCourseForAttempt } from "@/lib/planner";
import { PlanBoard } from "@/ui/plan/plan-board";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { Attempt } from "@/lib/coursemap/types";
import { courses, terms } from "./fixtures/catalogue";

const fixtures = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  starredCourses: [] as string[],
  extensionYears: 0,
  addCourse: vi.fn(async () => ({ ok: true })),
  removeAttempt: vi.fn(async () => ({ ok: true, message: "Course removed" })),
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
    removeAttempt: fixtures.removeAttempt,
    setPlanExtensionYears: fixtures.setPlanExtensionYears,
    reorderAttempt: vi.fn(),
    notify: vi.fn(),
  }),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/ui/overlays", () => ({
  CourseDialog: ({
    attemptId,
    catalogue,
  }: {
    attemptId: string;
    catalogue: PlanCatalogue;
  }) => {
    const attempt = fixtures.attempts.find((item) => item.id === attemptId);
    const course = attempt
      ? planningCourseForAttempt(attempt, catalogue)
      : undefined;
    return (
      <div role="dialog">
        {course ? `${course.code} ${course.year}` : "Missing course"}
      </div>
    );
  },
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

test("the planner offers study periods without a Later lane", () => {
  fixtures.attempts = [];
  render(<PlanBoard catalogue={{ ...catalogue, courses, terms }} />);
  expect(screen.queryByText("Later")).not.toBeInTheDocument();
  expect(screen.queryByText("Not scheduled yet")).not.toBeInTheDocument();
  expect(screen.getByTestId("term-2026-s1")).toBeVisible();
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

test("a planned course that is no longer published stays on the board to remove", async () => {
  fixtures.attempts = [
    {
      id: "unpublished-course",
      courseCode: "COMP1100",
      termId: "2026-s1",
      academicYear: 2026,
      status: "planned",
      isPublished: false,
    },
  ];
  fixtures.removeAttempt.mockClear();
  render(
    <TooltipProvider>
      <PlanBoard catalogue={{ ...catalogue, courses, terms }} />
    </TooltipProvider>,
  );
  const lane = screen.getByTestId("term-2026-s1");
  expect(lane).toHaveTextContent("COMP1100");
  expect(lane).toHaveTextContent("No longer published");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove COMP1100 from the plan" }),
  );
  await waitFor(() =>
    expect(fixtures.removeAttempt).toHaveBeenCalledWith("unpublished-course"),
  );
});

test("a course tooltip lists every hard and soft issue", async () => {
  fixtures.attempts = [
    {
      id: "flagged",
      courseCode: "COMP2100",
      academicYear: 2026,
      termId: "2026-s1",
      status: "planned",
    },
  ];
  const flaggedCourses = courses.map((course) =>
    course.code === "COMP2100"
      ? {
          ...course,
          prerequisiteCodes: ["COMP1100"],
          prerequisiteRule: undefined,
          sessions: ["Semester 2"],
          permissionText: "Convener permission is required",
        }
      : course,
  );
  render(
    <TooltipProvider>
      <PlanBoard catalogue={{ ...catalogue, courses: flaggedCourses, terms }} />
    </TooltipProvider>,
  );
  await userEvent.hover(
    screen.getByRole("button", { name: /Blocked.*COMP2100/ }),
  );
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("Needs COMP1100 first");
  expect(tooltip).toHaveTextContent("Not offered in Semester 1");
  expect(tooltip).toHaveTextContent("Convener permission is required");
});

test("an unimported planning year shows the stand-in edition and explains it", async () => {
  fixtures.attempts = [
    {
      id: "future",
      courseCode: courses[0].code,
      academicYear: 2027,
      termId: "2027-s1",
      status: "planned",
    },
  ];
  render(
    <TooltipProvider delayDuration={0}>
      <PlanBoard
        catalogue={{
          ...catalogue,
          courses: [{ ...courses[0], year: 2026 }],
          terms,
        }}
      />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Year 2/ }));
  expect(screen.queryByText("2026 details")).not.toBeInTheDocument();
  await userEvent.hover(
    screen.getByRole("button", { name: new RegExp(courses[0].name) }),
  );
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "ANU hasn't published 2027 details yet, so Coursemap uses 2026's.",
  );
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(courses[0].name) }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent(
    `${courses[0].code} 2026`,
  );
});

test("a full semester offers an overload that asks first rather than refusing", async () => {
  fixtures.attempts = courses.slice(0, 4).map((course, index) => ({
    id: `full-${index}`,
    courseCode: course.code,
    academicYear: 2026,
    termId: "2026-s1",
    status: "planned" as const,
  }));
  render(
    <TooltipProvider delayDuration={0}>
      <PlanBoard catalogue={{ ...catalogue, courses, terms }} />
    </TooltipProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", {
      name: /Overload .* 2026 with another course/,
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Take more than 24 units?" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Choose a course" })).toBeEnabled();
});

test("the suggestions sidebar stays neutral until its courses are ready", () => {
  fixtures.attempts = [];
  const { rerender } = render(
    <PlanBoard catalogue={catalogue} suggestionsLoading />,
  );
  const sidebar = screen.getByRole("complementary", {
    name: "Courses to plan",
  });
  expect(sidebar).toHaveAttribute("aria-busy", "true");
  expect(
    within(sidebar).getByRole("status", { name: "Loading course suggestions" }),
  ).toBeVisible();
  expect(within(sidebar).queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Course plan" })).toBeVisible();

  rerender(<PlanBoard catalogue={catalogue} />);
  expect(sidebar).toHaveAttribute("aria-busy", "false");
  expect(within(sidebar).queryByRole("status")).not.toBeInTheDocument();
  expect(
    within(sidebar).getByRole("tablist", { name: "Courses to plan" }),
  ).toBeVisible();
});
