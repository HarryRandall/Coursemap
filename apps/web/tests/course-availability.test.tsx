import {
  act,
  render as renderComponent,
  screen,
  within,
} from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { CourseAvailability } from "@/ui/courses/course-availability";

function render(element: React.ReactNode) {
  return renderComponent(
    <TooltipProvider delayDuration={0}>{element}</TooltipProvider>,
  );
}

const sessions = [
  "Autumn Session",
  "Spring Session",
  "Second Semester",
  "First Semester",
  "Summer Session",
  "Winter Session",
];

function measure(width: number) {
  const callbacks: ResizeObserverCallback[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 20,
        height: 20,
        width:
          this.getAttribute("aria-label") === "Available study periods"
            ? width
            : this.textContent?.startsWith("+")
              ? 24
              : 48,
      } as DOMRect;
    },
  );
  return (nextWidth: number) => {
    width = nextWidth;
    act(() =>
      callbacks.forEach((callback) => callback([], {} as ResizeObserver)),
    );
  };
}

function visibleBadges() {
  return within(
    screen
      .getByLabelText("Available study periods")
      .querySelector("[data-periods]") as HTMLElement,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("keeps all periods in calendar order on one row when they fit", () => {
  measure(400);
  render(<CourseAvailability sessions={sessions} />);
  const availability = screen.getByLabelText("Available study periods");

  expect(
    screen.queryByRole("button", { name: /more available study periods/ }),
  ).toBeNull();
  expect(visibleBadges().getByText("Sem 1")).toBeVisible();
  expect(visibleBadges().getByText("Spring")).toBeVisible();
  expect(availability.querySelector("[data-periods]")).toHaveTextContent(
    "Sem 1Sem 2SummerAutumnWinterSpring",
  );
});

test("reserves room for +N, reveals hidden periods on focus, and responds to resize", async () => {
  const resize = measure(140);
  const user = userEvent.setup();
  render(<CourseAvailability sessions={sessions} />);
  const more = screen.getByRole("button", {
    name: "Show 4 more available study periods",
  });
  expect(more).toHaveTextContent("+4");
  expect(visibleBadges().queryByText("Summer")).toBeNull();
  await user.hover(more);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Summer Session",
  );
  await user.unhover(more);
  await user.tab();
  expect(more).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Summer SessionAutumn SessionWinter SessionSpring Session",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  resize(40);
  expect(
    screen.getByRole("button", { name: "Show 6 more available study periods" }),
  ).toHaveTextContent("+6");
  resize(400);
  expect(
    screen.queryByRole("button", { name: /more available study periods/ }),
  ).toBeNull();
});

test("deduplicates sessions and handles missing availability", () => {
  measure(400);
  const { rerender } = render(
    <CourseAvailability
      sessions={["First Semester", "Second Semester", "First Semester"]}
    />,
  );
  expect(visibleBadges().getAllByText("Sem 1")).toHaveLength(1);
  expect(visibleBadges().getByText("Sem 2")).toBeVisible();
  rerender(
    <TooltipProvider>
      <CourseAvailability sessions={[]} />
    </TooltipProvider>,
  );
  expect(screen.getByText("Not listed")).toBeVisible();
});
