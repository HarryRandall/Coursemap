import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ResolvePanel } from "@/ui/plan/resolve-panel";
import { terms } from "./fixtures/catalogue";

vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: { courseOverrides: [], requirementOverrides: [] },
    bypassCourse: vi.fn(),
    notify: vi.fn(),
  }),
}));

test("a failed proposal says why and keeps taking it anyway separate", () => {
  render(
    <ResolvePanel
      courseCode="FINM3005"
      proposal={{
        ok: false,
        message:
          "FINM2001 only fits before S2 2025 in semesters that are already full (S1 2025).",
      }}
      busy={false}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/FINM2001 only fits before S2 2025/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Apply changes/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Take it anyway")).toBeInTheDocument();
});

test("a proposal lists its changes and applies them", () => {
  const onApply = vi.fn();
  render(
    <ResolvePanel
      courseCode="COMP2100"
      proposal={{
        ok: true,
        steps: [
          {
            type: "move",
            attemptId: "a",
            courseCode: "COMP1110",
            fromTermId: "2027-s2",
            toTermId: "2026-s2",
          },
        ],
        summary: "Move COMP1110 to S2 2026",
      }}
      catalogue={{ courses: [], terms } as never}
      busy={false}
      onApply={onApply}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText("S2 2026")).toBeInTheDocument();
  expect(screen.getByText("COMP1110")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Apply changes/ }));
  expect(onApply).toHaveBeenCalled();
});
