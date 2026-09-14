import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import AdminCourseDetailLoading from "@/app/admin/courses/[id]/loading";
import { Breadcrumbs } from "@/ui/shell/breadcrumbs";

const courseId = "21aa4acb-9c2e-47cf-b1ae-644edc831684";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/courses/21aa4acb-9c2e-47cf-b1ae-644edc831684/2026",
  useParams: () => ({
    id: "21aa4acb-9c2e-47cf-b1ae-644edc831684",
    year: "2026",
  }),
}));

vi.mock("@/ui/shell", () => ({
  AppShell: ({
    children,
    breadcrumbSegmentLabels,
    breadcrumbTrailingLabel,
  }: {
    children: ReactNode;
    breadcrumbSegmentLabels?: Record<string, string | null>;
    breadcrumbTrailingLabel?: string;
  }) => (
    <>
      <Breadcrumbs
        segmentLabels={breadcrumbSegmentLabels}
        trailingLabel={breadcrumbTrailingLabel}
      />
      {children}
    </>
  ),
}));

test("course loading reserves the course breadcrumb without exposing an identifier or an empty link", () => {
  const { rerender } = render(<AdminCourseDetailLoading />);
  const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(breadcrumb).getAllByRole("listitem")).toHaveLength(3);
  expect(breadcrumb.querySelectorAll("a[href]")).toHaveLength(2);
  expect(within(breadcrumb).queryByText("Course data")).not.toBeInTheDocument();
  expect(breadcrumb).not.toHaveTextContent(courseId);
  expect(breadcrumb).not.toHaveTextContent("2026");

  rerender(
    <Breadcrumbs segmentLabels={{ [courseId]: "AATD1001", "2026": null }} />,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("AATD1001")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Show hidden breadcrumbs" }),
  ).not.toBeInTheDocument();
});
