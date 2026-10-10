import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ScrollArea } from "@coursemap/ui/primitives/scroll-area";

// jsdom cannot scroll a layout, but viewport sizing and keyboard focus belong
// to the rendered primitive contract and must survive production compilation.
test("applies content-sized bounds and an accessible name to the viewport", () => {
  render(
    <ScrollArea
      viewportProps={{
        "aria-label": "Options",
        style: { height: "auto", maxHeight: "256px" },
      }}
    >
      <button>Last option</button>
    </ScrollArea>,
  );
  const viewport = screen.getByLabelText("Options");
  expect(viewport).toHaveAttribute("data-slot", "scroll-area-viewport");
  expect(viewport).toHaveAttribute("tabindex", "0");
  expect(viewport).toHaveStyle({ height: "auto", maxHeight: "256px" });
  viewport.focus();
  expect(viewport).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "Last option" }),
  ).toBeInTheDocument();
});
