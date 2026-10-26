import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  render as renderComponent,
  screen,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CoursesToPlan } from "@/ui/plan/courses-to-plan";
import { StatusMark } from "@/ui/plan/status-mark";
import {
  suggestionCondition as condition,
  suggestions,
  suggestionsCatalogue,
} from "./fixtures/planner-suggestions";
import { courses } from "./fixtures/catalogue";

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { requirementOverrides: [] },
    overrideRequirement: vi.fn(),
    notify: vi.fn(),
  }),
}));

const handlers = { onAdd: vi.fn(), onOpen: vi.fn(), onDragStart: vi.fn() };

test("open rules hide completed and planned courses, and covered rules fold into one line that opens", async () => {
  const item = suggestions(
    [
      condition(1, ["COMP1100", "COMP1110", "MATH1005"]),
      condition(2, ["COMP1100"]),
    ],
    new Map([
      ["COMP1100", "completed"],
      ["COMP1110", "planned"],
    ]),
  );
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(
    screen.getByRole("tab", { name: "Degree: 1 courses left to pick" }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Required courses" })).getByRole(
      "button",
      { name: "Add MATH1005 to your plan" },
    ),
  ).toBeVisible();
  expect(screen.queryByText("COMP1100")).not.toBeInTheDocument();
  expect(screen.queryByText("COMP1110")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add COMP1100 to your plan" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "1 rule done or planned" }),
  );
  await userEvent.click(
    within(
      screen.getByRole("group", { name: "Rules done or planned" }),
    ).getByRole("button", { expanded: false }),
  );
  expect(screen.getByText("COMP1100")).toBeVisible();
  expect(screen.getByLabelText("Completed")).toBeVisible();
});

test("a fully covered tab has a check and Starred hides while nothing is starred", () => {
  const item = suggestions(
    [condition(1, ["COMP1100"])],
    new Map([["COMP1100", "planned"]]),
  );
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(
    screen.getByRole("tab", { name: "Degree: 0 courses left to pick" }),
  ).toContainElement(screen.getByLabelText("done"));
  expect(screen.getByText("Degree requirements planned")).toBeVisible();
  expect(
    screen.queryByRole("tab", { name: "Starred" }),
  ).not.toBeInTheDocument();
});

test("a rule course the plan year lacks uses the nearest year's edition, and one no year publishes is left out", async () => {
  const [comp1100] = courses;
  const earlier = { ...comp1100, year: 2024, name: "Earlier edition" };
  const item = suggestions(
    [condition(1, ["COMP1100", "ZZZZ9999"], { minimumCourses: 1 })],
    new Map(),
    [],
    {
      ...suggestionsCatalogue,
      courses: [
        ...suggestionsCatalogue.courses.filter(
          (course) => course.code !== "COMP1100",
        ),
        { ...comp1100, year: 2028, name: "Later edition" },
        earlier,
      ],
    },
  );
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(screen.getByText("Earlier edition")).toBeVisible();
  expect(screen.queryByText("Later edition")).not.toBeInTheDocument();
  expect(screen.queryByText("ZZZZ9999")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Not published for this year/),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Add COMP1100 to your plan" }),
  );
  expect(handlers.onAdd).toHaveBeenCalledWith(earlier);
});

test("hard issues take the red Ban mark, soft issues amber, and an all-clear plan is dashed", () => {
  const { rerender } = render(
    <StatusMark
      status="planned"
      flags={{
        lifecycle: "planned",
        issues: [
          { code: "permission", severity: "soft", detail: "Permission" },
          {
            code: "offering",
            severity: "hard",
            detail: "Not offered in Spring",
          },
        ],
      }}
    />,
  );
  expect(screen.getByLabelText("Blocked")).toHaveClass("lucide-ban");
  rerender(
    <StatusMark
      status="planned"
      flags={{
        lifecycle: "planned",
        issues: [
          { code: "permission", severity: "soft", detail: "Permission" },
        ],
      }}
    />,
  );
  expect(screen.getByLabelText("Review needed")).toHaveClass(
    "lucide-triangle-alert",
  );
  rerender(
    <StatusMark
      status="planned"
      flags={{ lifecycle: "planned", issues: [] }}
    />,
  );
  expect(screen.getByLabelText("Planned")).toHaveClass("lucide-circle-dashed");
  rerender(
    <StatusMark status="completed" flags={{ lifecycle: "done", issues: [] }} />,
  );
  expect(screen.getByLabelText("Completed")).toHaveClass("lucide-circle-check");
});

test("unit-only tab counts are explicitly labelled as estimates", () => {
  const item = suggestions([
    condition(1, ["COMP1100", "COMP1110"], {
      minimumCourses: null,
      minimumUnits: 18,
    }),
  ]);
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(
    screen.getByRole("tab", {
      name: "Degree: 3 courses left to pick (estimate based on 6-unit courses)",
    }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Course count estimated using 6-unit courses/),
  ).not.toBeInTheDocument();
});

test("a long rule suggests a few courses, and showing all of them brings a search box", async () => {
  const item = suggestions([
    condition(
      1,
      ["COMP1100", "COMP1110", "COMP1600", "COMP2100", "COMP2300", "COMP2400"],
      { minimumCourses: 1 },
    ),
  ]);
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(screen.getByText("Suggested")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /to your plan$/ })).toHaveLength(
    3,
  );
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Show all 6/ }));
  expect(screen.getAllByRole("button", { name: /to your plan$/ })).toHaveLength(
    6,
  );
  await userEvent.type(screen.getByRole("searchbox"), "2300");
  expect(
    screen.getByRole("button", { name: "Add COMP2300 to your plan" }),
  ).toBeVisible();
  expect(screen.getByText("1 match")).toBeVisible();
});

test("a pick-one rule opens first with every option and no repeated count", () => {
  const item = suggestions([
    condition(1, ["COMP1100", "COMP1110"], { minimumCourses: 1 }),
  ]);
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  expect(screen.getAllByRole("button", { name: /to your plan$/ })).toHaveLength(
    2,
  );
  expect(screen.queryByText(/\/ 1 courses/)).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});

function render(ui: ReactElement) {
  return renderComponent(ui, { wrapper: TooltipProvider });
}

test("quick choices between a few courses come before rules with long lists", () => {
  const item = suggestions([
    condition(
      1,
      ["COMP1100", "COMP1110", "COMP1600", "COMP2100", "COMP2300", "COMP2400"],
      { minimumCourses: 1 },
    ),
    condition(2, ["MATH1005", "COMP2310"], { minimumCourses: 1 }),
  ]);
  render(
    <CoursesToPlan
      structures={[item]}
      starred={[]}
      inPlan={new Map()}
      {...handlers}
    />,
  );
  const [first] = screen.getAllByRole("region");
  expect(first).toHaveTextContent(/MATH1005/);
});
