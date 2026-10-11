import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  fireEvent,
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
} from "./fixtures/planner-suggestions";

const handlers = { onAdd: vi.fn(), onOpen: vi.fn(), onDragStart: vi.fn() };

test("open rules hide completed and planned courses, and covered rules leave the panel", () => {
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
      { name: "Add MATH1005 to this year" },
    ),
  ).toBeVisible();
  expect(screen.queryByText("COMP1100")).not.toBeInTheDocument();
  expect(screen.queryByText("COMP1110")).not.toBeInTheDocument();
  expect(screen.queryByText(/rules covered/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add COMP1100 to this year" }),
  ).not.toBeInTheDocument();
});

test("a fully covered tab has a check and Starred remains available", async () => {
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
  await userEvent.click(screen.getByRole("tab", { name: "Starred" }));
  expect(screen.getByText(/Star a course/)).toBeVisible();
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

function render(ui: ReactElement) {
  return renderComponent(ui, { wrapper: TooltipProvider });
}
