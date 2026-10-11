import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CoursePlacement } from "@/lib/coursemap/requirement-progress";
import { PlacementControl } from "@/ui/requirements/placement-control";

const labels: Record<string, string> = {
  computing: "Computing courses",
  electives: "Electives",
  "level-1000-cap": "1000-level limit",
};

function placementFor(
  current: CoursePlacement,
  options = ["computing", "electives"],
) {
  const onPlace = vi.fn();
  return {
    onPlace,
    placement: {
      allocation: new Map([["COMP1100", current]]),
      optionsFor: () =>
        options.map((nodeKey) => ({ nodeKey, label: labels[nodeKey]! })),
      labelFor: (nodeKey: string) => labels[nodeKey]!,
      onPlace,
    },
  };
}

test("a student moves a course to another part it qualifies for", async () => {
  const user = userEvent.setup();
  const { placement, onPlace } = placementFor({
    nodeKey: "computing",
    pinned: false,
    overCapKey: null,
  });
  render(<PlacementControl courseCode="COMP1100" placement={placement} />);
  const trigger = screen.getByRole("button", {
    name: "Counts towards for COMP1100",
  });
  expect(trigger).toHaveAttribute("title", "Counts towards");
  await user.click(trigger);
  expect(
    screen.queryByRole("button", { name: "Let Coursemap decide" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Electives" }));
  expect(onPlace).toHaveBeenCalledWith("COMP1100", "electives");
});

test("a student's choice can be handed back to Coursemap", async () => {
  const user = userEvent.setup();
  const { placement, onPlace } = placementFor({
    nodeKey: "electives",
    pinned: true,
    overCapKey: null,
  });
  render(<PlacementControl courseCode="COMP1100" placement={placement} />);
  const trigger = screen.getByRole("button", {
    name: "Counts towards for COMP1100",
  });
  expect(trigger).toHaveAttribute(
    "title",
    "You chose where this course counts",
  );
  await user.click(trigger);
  await user.click(
    screen.getByRole("button", { name: "Let Coursemap decide" }),
  );
  expect(onPlace).toHaveBeenCalledWith("COMP1100", null);
});

test("a course over a limit says it counts towards nothing", () => {
  const { placement } = placementFor({
    nodeKey: null,
    pinned: false,
    overCapKey: "level-1000-cap",
  });
  render(<PlacementControl courseCode="COMP1100" placement={placement} />);
  expect(
    screen.getByText(/Over the limit on 1000-level limit/),
  ).toHaveTextContent("counts towards nothing");
  expect(
    screen.queryByRole("button", { name: "Counts towards for COMP1100" }),
  ).not.toBeInTheDocument();
});

test("a course no part accepts says so", () => {
  const { placement } = placementFor(
    { nodeKey: null, pinned: false, overCapKey: null },
    [],
  );
  render(<PlacementControl courseCode="COMP1100" placement={placement} />);
  expect(
    screen.getByText("Doesn't count towards this degree"),
  ).toBeInTheDocument();
});

test("one qualifying destination has no control, even when pinned", () => {
  const { placement } = placementFor(
    { nodeKey: "computing", pinned: true, overCapKey: null },
    ["computing"],
  );
  const { container } = render(
    <PlacementControl courseCode="COMP1100" placement={placement} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test("the counts-towards menu opens with the keyboard and returns focus on Escape", async () => {
  const user = userEvent.setup();
  const { placement } = placementFor({
    nodeKey: "electives",
    pinned: false,
    overCapKey: null,
  });
  render(<PlacementControl courseCode="COMP1100" placement={placement} />);
  const trigger = screen.getByRole("button", {
    name: "Counts towards for COMP1100",
  });
  expect(trigger).toHaveTextContent("Counts towards: Electives");
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(
    screen.getByRole("button", { name: "Computing courses" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("button", { name: "Computing courses" }),
  ).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("a course counting somewhere it cannot be moved shows nothing", () => {
  const { placement } = placementFor(
    { nodeKey: "computing", pinned: false, overCapKey: null },
    [],
  );
  const { container } = render(
    <PlacementControl courseCode="COMP1100" placement={placement} />,
  );
  expect(container).toBeEmptyDOMElement();
});
