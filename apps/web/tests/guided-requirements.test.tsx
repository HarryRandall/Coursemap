import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { GuidedRequirements } from "@/ui/requirements/guided-requirements";
import type { CourseHints } from "@/ui/plan/plan-suggestions";
import {
  suggestionCondition as condition,
  suggestions,
} from "./fixtures/planner-suggestions";
import { courses } from "./fixtures/catalogue";

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { requirementOverrides: [] },
    overrideRequirement: vi.fn(),
    notify: vi.fn(),
  }),
}));

const hints: CourseHints = {
  academicYear: 2026,
  prerequisites: () => "met",
  rank: (courses) => [...courses],
};

function renderGuided(onAdd = vi.fn()) {
  const item = suggestions(
    [
      condition(1, ["COMP1100", "COMP1110"], { minimumCourses: 1 }),
      condition(2, ["MATH1005", "COMP1600"], { minimumCourses: 1 }),
      condition(3, ["COMP2100"]),
    ],
    new Map([["COMP2100", "completed"]]),
  );
  render(
    <GuidedRequirements
      structures={[item]}
      hints={hints}
      onAdd={onAdd}
      onOpen={vi.fn()}
      fullRules={<p>Every rule as a tree</p>}
    />,
    { wrapper: TooltipProvider },
  );
  return { onAdd };
}

test("open rules come one at a time without a Back on the first, and skipping them all ends on what is left", async () => {
  const user = userEvent.setup();
  renderGuided();
  expect(
    screen.queryByRole("button", { name: /Back/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Add COMP1100 to your plan" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Skip for now/ }));
  expect(screen.getByRole("button", { name: /Back/ })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Add MATH1005 to your plan" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Skip for now/ }));
  await user.click(screen.getByRole("button", { name: /Finish/ }));
  expect(
    screen.getByRole("heading", { name: "2 rules still to plan" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Go to the next open rule" }),
  );
  expect(
    screen.getByRole("button", { name: "Add COMP1100 to your plan" }),
  ).toBeVisible();
});

test("a step adds through the shared sheet and leaves overrides to the full rule list", async () => {
  const user = userEvent.setup();
  const { onAdd } = renderGuided();
  await user.click(
    screen.getByRole("button", { name: "Add COMP1110 to your plan" }),
  );
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ code: "COMP1110" }),
  );
  expect(
    screen.queryByRole("button", { name: "Requirement options" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Show every rule" }));
  expect(screen.getByText("Every rule as a tree")).toBeVisible();
});

test("rules already met sit at the end of the bar and open to what met them", async () => {
  const user = userEvent.setup();
  renderGuided();
  const steps = screen.getAllByRole("button", { name: /done or planned$/ });
  expect(steps).toHaveLength(1);
  await user.click(steps[0]!);
  expect(screen.getByText("Done or planned")).toBeVisible();
  expect(screen.getByText("COMP2100")).toBeVisible();
  expect(screen.getByLabelText("Completed")).toBeVisible();
});

test("a long rule in a step lists its courses with the search box open", () => {
  const item = suggestions([
    condition(
      1,
      ["COMP1100", "COMP1110", "COMP1600", "COMP2100", "COMP2300", "COMP2400"],
      { minimumCourses: 1 },
    ),
  ]);
  render(
    <GuidedRequirements
      structures={[item]}
      hints={hints}
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      fullRules={null}
    />,
    { wrapper: TooltipProvider },
  );
  expect(screen.getByRole("searchbox")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /to your plan$/ })).toHaveLength(
    6,
  );
});

test("an electives step opens on a page of courses, with 20 more on request", async () => {
  const user = userEvent.setup();
  const page = (codes: string[]) => ({
    ok: true,
    json: async () => ({
      courses: codes.map((code) => ({
        ...courses.find((course) => course.code === "COMP1100")!,
        code,
        name: `Course ${code}`,
      })),
      total: 25,
    }),
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(page(["ARTS1001", "BIOL1001"]))
    .mockResolvedValueOnce(page(["CHEM1001"]));
  vi.stubGlobal("fetch", fetch);
  const item = suggestions([
    condition(1, [], {
      conditionKind: "elective_units",
      minimumCourses: null,
      minimumUnits: 12,
    }),
  ]);
  render(
    <GuidedRequirements
      structures={[item]}
      hints={hints}
      onAdd={vi.fn()}
      onOpen={vi.fn()}
      fullRules={null}
    />,
    { wrapper: TooltipProvider },
  );
  expect(
    await screen.findByRole("button", { name: "Add ARTS1001 to your plan" }),
  ).toBeVisible();
  expect(String(fetch.mock.calls[0]?.[0])).toContain("browse=1");
  await user.click(screen.getByRole("button", { name: /Show 20 more/ }));
  expect(
    await screen.findByRole("button", { name: "Add CHEM1001 to your plan" }),
  ).toBeVisible();
  expect(String(fetch.mock.calls[1]?.[0])).toContain("page=2");
  vi.unstubAllGlobals();
});
