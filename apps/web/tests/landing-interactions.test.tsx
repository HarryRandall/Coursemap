import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LandingGridBackground } from "@/ui/landing/landing-grid-background";
import { LandingCourseShowcase } from "@/ui/landing/landing-course-showcase";
import type { ShowcaseCourse } from "@/lib/coursemap/landing-courses";

vi.mock("@/ui/courses/enrolment-steps", () => ({ EnrolmentSteps: () => null }));
vi.mock("@/ui/courses/requisite-diagram", () => ({
  RequisiteDiagram: () => null,
}));
vi.mock("@/ui/landing/landing-fit", () => ({
  LandingFit: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => vi.unstubAllGlobals());

const course = (code: string): ShowcaseCourse => ({
  code,
  name: code,
  year: 2026,
  enrolmentRule: {
    kind: "group",
    operator: "all_of",
    minimumCount: null,
    conditions: [],
  },
  prerequisiteRule: null,
  hasPrerequisiteWording: false,
  availableCourseCodes: [],
  unlocks: [],
  unlocksAreKnown: false,
});

test("example course tabs support arrow navigation and keep a single tab stop", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <LandingCourseShowcase
      courses={[course("COMP2100"), course("COMP2300")]}
    />,
  );
  const first = screen.getByRole("tab", { name: /COMP2100/ });
  const second = screen.getByRole("tab", { name: /COMP2300/ });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(second).toHaveFocus();
  expect(second).toHaveAttribute("aria-selected", "true");
  expect(first).toHaveAttribute("tabindex", "-1");
  expect(screen.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    second.id,
  );
  fireEvent.keyDown(second, { key: "Home" });
  expect(first).toHaveFocus();
  expect(first).toHaveAttribute("aria-selected", "true");
});

test("the decorative grid stops flickering when reduced motion changes and releases its listener", () => {
  const media = Object.assign(new EventTarget(), { matches: false });
  const remove = vi.spyOn(media, "removeEventListener");
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private callback: (
          entries: { contentRect: { width: number; height: number } }[],
        ) => void,
      ) {}
      observe() {
        this.callback([{ contentRect: { width: 1200, height: 400 } }]);
      }
      disconnect() {}
    },
  );
  const { container, unmount } = render(
    <section>
      <LandingGridBackground />
    </section>,
  );
  const squares = () => container.querySelectorAll("rect.landing-grid-flicker");
  expect(squares()).toHaveLength(14);
  act(() => {
    media.matches = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(squares()).toHaveLength(0);
  unmount();
  expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
});
