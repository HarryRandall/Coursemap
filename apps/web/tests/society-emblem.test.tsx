import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EXAMPLE_SOCIETIES } from "@/tests/fixtures/societies";
import { SocietyEmblem } from "@/ui/societies/society-emblem";

test("a failed logo falls back to an icon without suppressing another society's logo", () => {
  const society = EXAMPLE_SOCIETIES.find(
    (item) => item.slug === "anime-and-gaming-society",
  )!;
  const { container, rerender } = render(<SocietyEmblem society={society} />);
  fireEvent.error(screen.getByAltText(""));
  expect(screen.queryByAltText("")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
  rerender(
    <SocietyEmblem
      society={{ ...society, logoUrl: "https://example.com/another-logo.png" }}
    />,
  );
  expect(screen.getByAltText("").getAttribute("src")).toBe(
    "https://example.com/another-logo.png",
  );
});
