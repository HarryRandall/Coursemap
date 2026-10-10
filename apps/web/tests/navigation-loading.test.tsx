import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import PlanLoading from "@/app/plan/loading";
import DashboardLoading from "@/app/dashboard/loading";
import CoursesLoading from "@/app/courses/(directory)/loading";
import CourseLoading from "@/app/courses/[year]/[code]/loading";
import RoomsLoading from "@/app/rooms/loading";
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
test.each([
  [PlanLoading, "Loading your course plan"],
  [DashboardLoading, "Loading dashboard"],
  [CoursesLoading, "Loading Courses"],
  [CourseLoading, "Loading course"],
  [RoomsLoading, "Loading map..."],
])("heavy navigation has an accessible skeleton: %s", (Loading, label) => {
  const { container } = render(<Loading />);
  expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});
