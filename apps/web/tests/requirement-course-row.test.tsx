import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { RequirementCourseRow } from "@/ui/requirements/requirement-course-row";

test("unimported courses still link to their page and cannot be added", () => {
  const onAdd = vi.fn();
  render(
    <TooltipProvider>
      <ul>
        <RequirementCourseRow
          code="BUSN1001"
          course={undefined}
          year={2026}
          status={null}
          onAdd={onAdd}
        />
      </ul>
    </TooltipProvider>,
  );
  expect(screen.getByRole("link", { name: /BUSN1001/ })).toHaveAttribute(
    "href",
    "/courses/2026/busn1001",
  );
  expect(
    screen.queryByRole("button", { name: /Add BUSN1001/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Not planned")).toBeVisible();
});

test("a repeatable course says how many units its attempts may count", () => {
  render(
    <TooltipProvider>
      <ul>
        <RequirementCourseRow
          code="FREN3107"
          course={undefined}
          year={2026}
          status={null}
          repeatUnits={24}
        />
      </ul>
    </TooltipProvider>,
  );
  expect(screen.getByText(/may be repeated, up to 24 units/)).toBeVisible();
});
