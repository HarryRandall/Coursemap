import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CourseAvailability } from "@/ui/courses/course-availability";

test("shows both semesters first and every other period below in calendar order", () => {
  render(
    <CourseAvailability
      sessions={[
        "Autumn Session",
        "Spring Session",
        "Second Semester",
        "Intensive Session",
        "First Semester",
        "Summer Session",
        "Winter Session",
      ]}
    />,
  );

  const availability = screen.getByLabelText("Available study periods");
  const [semesters, others] = Array.from(availability.children);
  expect(within(semesters as HTMLElement).getAllByText(/Sem/)).toHaveLength(2);
  expect(semesters).toHaveTextContent("Sem 1Sem 2");
  expect(others).toHaveTextContent("SummerAutumnWinterSpringIntensive Session");
});

test("deduplicates sessions and handles missing availability", () => {
  const { rerender } = render(
    <CourseAvailability
      sessions={["First Semester", "Second Semester", "First Semester"]}
    />,
  );
  expect(screen.getAllByText("Sem 1")).toHaveLength(1);
  expect(screen.getByText("Sem 2")).toBeVisible();

  rerender(<CourseAvailability sessions={[]} />);
  expect(screen.getByText("Not listed")).toBeVisible();
});
