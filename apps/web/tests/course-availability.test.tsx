import { expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { CourseAvailability } from "@/ui/courses/course-availability";

test("keeps long availability lists compact and reveals only hidden sessions on hover and keyboard focus", async () => {
  const user = userEvent.setup();
  const sessions = [
    "Autumn Session",
    "First Semester",
    "Second Semester",
    "Spring Session",
    "Summer Session",
    "Winter Session",
  ];
  render(
    <TooltipProvider>
      <CourseAvailability courseCode="AATD1001" sessions={sessions} />
    </TooltipProvider>,
  );
  expect(screen.getByText("Autumn Session")).toBeVisible();
  expect(screen.getByText("First Semester")).toBeVisible();
  expect(screen.queryByText("Winter Session")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", {
    name: "Show 4 more available study periods for AATD1001",
  });
  expect(trigger).toHaveTextContent("+4");
  await user.hover(trigger);
  const tooltip = await screen.findByRole("tooltip");
  for (const session of sessions.slice(0, 2)) {
    expect(within(tooltip).queryByText(session)).not.toBeInTheDocument();
  }
  for (const session of sessions.slice(2)) {
    expect(within(tooltip).getByText(session)).toBeInTheDocument();
  }
  await user.keyboard("{Escape}");
  await user.unhover(trigger);
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );
  await user.tab();
  expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
});

test("shows short lists without an overflow control and handles missing availability", () => {
  const { rerender } = render(
    <CourseAvailability courseCode="COMP3600" sessions={["Second Semester"]} />,
  );
  expect(screen.getByText("Second Semester")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(
    <CourseAvailability
      courseCode="COMP3600"
      sessions={["First Semester", "Second Semester", "First Semester"]}
    />,
  );
  expect(screen.getAllByText("First Semester")).toHaveLength(1);
  expect(screen.getByText("Second Semester")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<CourseAvailability courseCode="COMP3600" sessions={[]} />);
  expect(screen.getByText("Not listed")).toBeVisible();
});
