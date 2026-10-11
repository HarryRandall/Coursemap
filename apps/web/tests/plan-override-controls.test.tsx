import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CoursesToPlan } from "@/ui/plan/courses-to-plan";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import type { StructureToPlan } from "@/ui/plan/plan-suggestions";
import { TakeAnywayForm } from "@/ui/plan/take-anyway-form";
import { RequirementOverrideControl } from "@/ui/requirements/requirement-override-control";
import type {
  CourseOverride,
  RequirementOverride,
} from "@/lib/coursemap/types";

const context = vi.hoisted(() => ({
  state: {
    courseOverrides: [] as CourseOverride[],
    requirementOverrides: [] as RequirementOverride[],
  },
  bypassCourse: vi.fn(),
  overrideRequirement: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/app/providers", () => ({ useCoursemap: () => context }));
beforeEach(() => {
  vi.clearAllMocks();
  context.state.courseOverrides = [];
  context.state.requirementOverrides = [];
  context.bypassCourse.mockResolvedValue({ ok: true, message: "Saved." });
  context.overrideRequirement.mockResolvedValue({
    ok: true,
    message: "Saved.",
  });
});

test("taking a blocked course anyway saves the chosen reason and note", async () => {
  const onDone = vi.fn();
  render(<TakeAnywayForm courseCode="COMP1100" onDone={onDone} />);
  expect(
    screen.queryByRole("button", { name: "Take it anyway" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("radio", { name: "I have credit or an exemption" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
    target: { value: "Credit from UNSW" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Take it anyway" }));
  await waitFor(() =>
    expect(context.bypassCourse).toHaveBeenCalledWith("COMP1100", {
      reason: "credit",
      note: "Credit from UNSW",
    }),
  );
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test("a requirement can be marked satisfied and an existing override undone", async () => {
  const { rerender } = render(
    <TooltipProvider>
      <RequirementOverrideControl
        structureCode="TEST"
        requirementKey="electives"
      />
    </TooltipProvider>,
  );
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Requirement options" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Mark as satisfied" }),
  );
  fireEvent.change(screen.getByLabelText("Units credited (optional)"), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(context.overrideRequirement).toHaveBeenCalledWith(
      "TEST",
      "electives",
      { reason: "approval", creditedUnits: 6 },
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  context.state.requirementOverrides = [
    { structureCode: "TEST", requirementKey: "electives", reason: "credit" },
  ];
  rerender(
    <TooltipProvider>
      <RequirementOverrideControl
        structureCode="TEST"
        requirementKey="electives"
      />
    </TooltipProvider>,
  );
  expect(screen.getByText("Marked satisfied")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(context.overrideRequirement).toHaveBeenCalledWith(
      "TEST",
      "electives",
      null,
    ),
  );
});

test("the planner side panel exposes the same override control in its rule header", async () => {
  const item: StructureToPlan = {
    structure: {
      code: "TEST",
      kind: "programme",
      name: "Test structure",
      root: {
        type: "group",
        id: 1,
        groupKey: "root",
        children: [],
        description: null,
        maximumUnits: null,
        minimumCount: null,
        minimumUnits: null,
        operator: "all_of",
        position: 0,
        sourceLocator: "",
        sourceText: "",
        title: null,
        scope: "part",
      },
      context: readingTreeContext({ academicYear: 2026 }),
    },
    openCount: 1,
    estimatedCount: false,
    rules: [
      {
        key: "rule",
        requirementKey: "electives",
        heading: "Electives",
        detail: "6 elective units",
        count: "0 / 6 units",
        progress: 0,
        covered: false,
        compulsory: false,
        courses: [],
        remainingCourses: 1,
        estimatedCount: false,
        catchAll: false,
        browse: null,
        matching: null,
        note: null,
      },
    ],
  };
  render(
    <TooltipProvider>
      <CoursesToPlan
        structures={[item]}
        starred={[]}
        inPlan={new Map()}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
        onDragStart={vi.fn()}
      />
    </TooltipProvider>,
  );
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Requirement options" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Mark as satisfied" }),
  );
  expect(
    await screen.findByRole("dialog", {
      name: "Mark requirement as satisfied",
    }),
  ).toBeVisible();
});
