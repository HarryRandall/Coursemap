import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SocietyScrollContent } from "@/ui/societies/society-scroll-content";

test("the edge fade grows with scroll distance and clears at the top", () => {
  render(
    <SocietyScrollContent>
      <p>Events</p>
    </SocietyScrollContent>,
  );
  const scrollArea = screen.getByText("Events").parentElement!;
  expect(scrollArea.style.maskImage).toBe("");
  fireEvent.scroll(scrollArea, { target: { scrollTop: 12 } });
  expect(scrollArea.style.maskImage).toContain("rgba(0, 0, 0, 0.5)");
  fireEvent.scroll(scrollArea, { target: { scrollTop: 200 } });
  expect(scrollArea.style.maskImage).toContain("rgba(0, 0, 0, 0)");
  fireEvent.scroll(scrollArea, { target: { scrollTop: 0 } });
  expect(scrollArea.style.maskImage).toBe("");
});
