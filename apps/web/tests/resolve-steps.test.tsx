import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { ResolveSteps } from "@/ui/plan/resolve-steps";

const catalogue = {
  terms: [
    { id: "2026-s1", year: 2026, name: "First Semester" },
    { id: "2026-s2", year: 2026, name: "Second Semester" },
    { id: "2027-s1", year: 2027, name: "First Semester" },
  ],
  courses: [{ code: "MATH1005", name: "Discrete Mathematical Models" }],
} as unknown as PlanCatalogue;

it("lists the changes in degree order with their semesters and applies them", async () => {
  const onApply = vi.fn();
  const onDismiss = vi.fn();
  render(
    <ResolveSteps
      steps={[
        {
          type: "move",
          attemptId: "a",
          courseCode: "COMP1110",
          fromTermId: "2026-s1",
          toTermId: "2027-s1",
        },
        {
          type: "add",
          academicYear: 2026,
          courseCode: "MATH1005",
          termId: "2026-s2",
        },
      ]}
      catalogue={catalogue}
      busy={false}
      onApply={onApply}
      onDismiss={onDismiss}
    />,
  );
  expect(screen.getByText("2 changes clear this")).toBeVisible();
  const items = screen.getAllByRole("listitem");
  expect(items[0]).toHaveTextContent(
    "S2 2026Add MATH1005 Discrete Mathematical Models",
  );
  expect(items[1]).toHaveTextContent("S1 2027Move COMP1110");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Apply changes" }));
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();
});
