import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PlanOverrideDialog } from "@/ui/common/plan-override-dialog";
import { CoursePlanStatus } from "@/ui/courses/course-plan-status";

test("course bypass dialog saves a reason and optional note", async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, message: "Saved." });
  const close = vi.fn();
  render(
    <PlanOverrideDialog
      title="Take COMP1100 anyway"
      onSave={save}
      onClose={close}
    />,
  );
  fireEvent.click(screen.getByLabelText("Coursemap's data is wrong"));
  fireEvent.change(screen.getByLabelText("Optional note"), {
    target: { value: "Missing alternative" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith({
    reason: "data_error",
    note: "Missing alternative",
  });
});

test("requirement dialog saves explicit units and keeps failed input", async () => {
  const save = vi
    .fn()
    .mockResolvedValue({ ok: false, message: "Could not save." });
  const close = vi.fn();
  render(
    <PlanOverrideDialog
      title="Mark requirement as satisfied"
      requirement
      onSave={save}
      onClose={close}
    />,
  );
  fireEvent.change(screen.getByLabelText("Units credited (optional)"), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save.");
  expect(save).toHaveBeenCalledWith({ reason: "approval", creditedUnits: 6 });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Units credited (optional)")).toHaveValue(6);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
});

test("course status distinguishes a planned bypass from a recorded result", () => {
  const attempt = {
    id: "one",
    courseCode: "COMP1100",
    termId: "2026-s1",
    status: "planned" as const,
  };
  const { rerender } = render(<CoursePlanStatus attempt={attempt} bypassed />);
  expect(screen.getByText(/Bypassed/)).toBeInTheDocument();
  rerender(
    <CoursePlanStatus attempt={{ ...attempt, status: "completed" }} bypassed />,
  );
  expect(screen.queryByText(/Bypassed/)).not.toBeInTheDocument();
});
