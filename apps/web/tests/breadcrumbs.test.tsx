import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Breadcrumbs } from "@/ui/shell/breadcrumbs";

let pathname = "/admin/courses/2026/infs1001";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

afterEach(() => {
  pathname = "/admin/courses/2026/infs1001";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function measureAt(initialWidth: number) {
  let width = initialWidth;
  let resize = () => {};
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const measuredWidth = this.matches("nav")
        ? width
        : this.hasAttribute("data-crumb-measure")
          ? 100
          : this.dataset.slot === "breadcrumb-separator"
            ? 14
            : 0;
      return {
        width: measuredWidth,
        height: 20,
        top: 0,
        left: 0,
        bottom: 20,
        right: measuredWidth,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe(target: HTMLElement) {
        if (target.matches("nav")) resize = this.callback;
      }
      disconnect() {}
    },
  );
  return (nextWidth: number) =>
    act(() => {
      width = nextWidth;
      resize();
    });
}

test("caps long trails at three positions even when there is room", () => {
  const resize = measureAt(600);
  render(<Breadcrumbs currentLabel="INFS1001" />);
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getAllByRole("listitem")).toHaveLength(3);
  expect(
    within(trail).queryByRole("link", { name: "Courses" }),
  ).not.toBeInTheDocument();
  expect(
    within(trail).queryByRole("link", { name: "2026" }),
  ).not.toBeInTheDocument();

  resize(220);
  expect(within(trail).getByRole("link", { name: "Admin" })).toHaveAttribute(
    "href",
    "/admin/dashboard",
  );
  expect(within(trail).getByText("INFS1001")).toHaveAttribute(
    "class",
    "truncate",
  );
  expect(
    within(trail).queryByRole("link", { name: "2026" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(
    within(trail).getByRole("button", { name: "Show hidden breadcrumbs" }),
    { key: "ArrowDown" },
  );
  expect(screen.getByRole("menuitem", { name: "Courses" })).toHaveAttribute(
    "href",
    "/admin/courses",
  );
  expect(screen.getByRole("menuitem", { name: "2026" })).toHaveAttribute(
    "href",
    "/admin/courses/2026",
  );
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  resize(600);
  expect(within(trail).getAllByRole("listitem")).toHaveLength(3);
  expect(
    within(trail).getByRole("button", { name: "Show hidden breadcrumbs" }),
  ).toBeVisible();
});

test("keeps the base and current section when a page has a trailing tab", () => {
  measureAt(200);
  render(
    <Breadcrumbs
      currentLabel="INFS1001"
      trailingLabel="Source and artefacts"
    />,
  );
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getByRole("link", { name: "Admin" })).toBeVisible();
  expect(
    within(trail).getByRole("link", { name: "Source and artefacts" }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    within(trail).getByRole("button", { name: "Show hidden breadcrumbs" }),
  ).toBeVisible();
  expect(trail).not.toHaveTextContent("infs1001");
});

test("reveals the hidden links on mouse hover", () => {
  measureAt(220);
  render(<Breadcrumbs currentLabel="INFS1001" />);
  const trigger = screen.getByRole("button", {
    name: "Show hidden breadcrumbs",
  });
  const event = new MouseEvent("pointerover", { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(trigger, event);
  expect(screen.getByRole("menuitem", { name: "Courses" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "2026" })).toBeVisible();
});

test("shows three short breadcrumbs until width requires collapsing the middle", () => {
  const resize = measureAt(600);
  render(
    <Breadcrumbs currentLabel="INFS1001" segmentLabels={{ "2026": null }} />,
  );
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getByRole("link", { name: "Courses" })).toBeVisible();
  expect(within(trail).queryByRole("button")).not.toBeInTheDocument();
  resize(220);
  expect(
    within(trail).queryByRole("link", { name: "Courses" }),
  ).not.toBeInTheDocument();
  expect(
    within(trail).getByRole("button", { name: "Show hidden breadcrumbs" }),
  ).toBeVisible();
  resize(600);
  expect(within(trail).getByRole("link", { name: "Courses" })).toBeVisible();
});

test("does not repeat a catalogue section on its year directory", () => {
  measureAt(600);
  render(<Breadcrumbs segmentLabels={{ "2026": null, infs1001: null }} />);
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getAllByRole("listitem")).toHaveLength(2);
  expect(within(trail).getByRole("link", { name: "Admin" })).toBeVisible();
  expect(within(trail).getByRole("link", { name: "Courses" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(trail).not.toHaveTextContent("2026");
});

test.each([
  {
    route: "/admin/operations/catalogue",
    currentLabel: "Catalogue",
    trailingLabel: "Syncs",
  },
  {
    route: "/admin/operations/catalogue/discovery",
    currentLabel: undefined,
    trailingLabel: undefined,
  },
])("shows the active catalogue operations section on $route", (props) => {
  pathname = props.route;
  measureAt(600);
  render(
    <Breadcrumbs
      currentLabel={props.currentLabel}
      segmentLabels={{ operations: null }}
      trailingLabel={props.trailingLabel}
    />,
  );

  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getByRole("link", { name: "Admin" })).toBeVisible();
  expect(within(trail).getByRole("link", { name: "Catalogue" })).toBeVisible();
  expect(
    within(trail).getByRole("link", {
      name: props.trailingLabel ?? "Discovery",
    }),
  ).toHaveAttribute("aria-current", "page");
});
