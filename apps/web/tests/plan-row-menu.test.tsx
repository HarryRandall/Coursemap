import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Term } from "@/lib/coursemap/types";
import { PlanRowMenu } from "@/ui/plan/plan-row-menu";

it("opens, moves and removes a planned course from its menu", async () => {
  const onOpen = vi.fn();
  const onMove = vi.fn();
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(
    <PlanRowMenu
      course={{ code: "COMP1110", name: "Structured Programming" }}
      moveTargets={[
        { id: "2027-s1", name: "First Semester", year: 2027 } as Term,
      ]}
      coursePageHref={null}
      onOpen={onOpen}
      onMove={onMove}
      onRemove={onRemove}
    />,
  );
  await user.click(screen.getByRole("button", { name: "More for COMP1110" }));
  expect(screen.queryByText("Open course page")).not.toBeInTheDocument();
  screen.getByRole("menuitem", { name: /Move to/ }).focus();
  await user.keyboard("{ArrowRight}");
  await screen.findByRole("menuitem", { name: "S1 2027" });
  await user.keyboard("{Enter}");
  expect(onMove).toHaveBeenCalledWith("2027-s1");
  await user.click(screen.getByRole("button", { name: "More for COMP1110" }));
  await user.click(screen.getByRole("menuitem", { name: "Remove from plan" }));
  expect(onRemove).toHaveBeenCalledOnce();
});
