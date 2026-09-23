import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { expect, test } from "vitest";

import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";

function renderMarkdown(markdown: string, available: string[] = []) {
  return render(
    <TooltipProvider>
      <CatalogueMarkdown
        markdown={markdown}
        academicYear={2026}
        availableCourseCodes={new Set(available)}
      />
    </TooltipProvider>,
  );
}

test("a recommended-course list reads as a list with course links", () => {
  renderMarkdown(
    [
      "**What courses should you take in first year?**",
      "",
      "- MATH1115 Advanced Mathematics and Applications 1",
      "- MATH1116 Advanced Mathematics and Applications 2",
    ].join("\n"),
    ["MATH1115"],
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "MATH1115" })).toHaveAttribute(
    "href",
    "/courses/2026/math1115",
  );
  // An unpublished course is named but not linked.
  expect(screen.queryByRole("link", { name: "MATH1116" })).toBeNull();
  expect(
    screen
      .getByText("What courses should you take in first year?")
      .closest("strong"),
  ).not.toBeNull();
});

test("record links stay in Coursemap and other links leave safely", () => {
  renderMarkdown(
    "Take it with a [Mathematics Major](http://programsandcourses.anu.edu.au/major/MATH-MAJ) or [Bachelor of Arts](BARTS). [Apply](https://study.anu.edu.au/apply) or email students.cos@anu.edu.au.",
  );
  expect(
    screen.getByRole("link", { name: "Mathematics Major" }),
  ).toHaveAttribute("href", "/majors/2026/math-maj");
  expect(
    screen.getByRole("link", { name: "Bachelor of Arts" }),
  ).toHaveAttribute("href", "/programmes/2026/barts");
  const external = screen.getByRole("link", { name: "Apply" });
  expect(external).toHaveAttribute("target", "_blank");
  expect(external).toHaveAttribute("rel", "noopener noreferrer");
  expect(
    screen.getByRole("link", { name: "students.cos@anu.edu.au" }),
  ).toHaveAttribute("href", "mailto:students.cos@anu.edu.au");
});

test("markup in imported text is shown as text, never run", () => {
  const { container } = renderMarkdown(
    '<img src=x onerror="alert(1)"> [click](javascript:alert(1))',
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link", { name: "click" })).toBeNull();
  expect(screen.getByText(/<img src=x/u)).toBeInTheDocument();
});
