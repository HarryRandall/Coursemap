import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { StudentRecord } from "@/lib/coursemap/requisite-evaluation";
import type { Attempt } from "@/lib/coursemap/types";
import {
  suggestedPlacement,
  termPlacements,
} from "@/lib/coursemap/term-placement";
import { AddCourseSheet } from "@/ui/plan/add-course-sheet";
import { courses, terms } from "./fixtures/catalogue";

const catalogue = { courses, terms };
const course = (code: string) => courses.find((item) => item.code === code)!;
const student: StudentRecord = {
  completed: new Map(),
  enrolled: new Set(),
  enrolledUnits: new Map(),
  commencementYear: 2026,
  programmeCodes: [],
  structureCodes: [],
  permissionApproved: false,
  wam: null,
  gpa: null,
  studyYear: null,
};

function sheet(attempts: Attempt[], props: { parentCode?: string } = {}) {
  const placements = termPlacements({
    course: course("COMP2100"),
    terms: terms.filter((term) => term.year <= 2027),
    attempts,
    catalogue,
  });
  const handlers = {
    onAdd: vi.fn(),
    onAddPrerequisite: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <AddCourseSheet
      course={course("COMP2100")}
      placements={placements}
      initialTermId={suggestedPlacement(placements)?.term.id ?? null}
      studentFor={() => student}
      findCourse={course}
      {...props}
      {...handlers}
    />,
  );
  return handlers;
}

test("only semesters that run the course are offered, and the best one starts selected", async () => {
  const { onAdd } = sheet([
    {
      id: "a",
      courseCode: "COMP1110",
      termId: "2026-s2",
      academicYear: 2026,
      status: "completed",
    },
  ]);
  const dialog = screen.getByRole("dialog", {
    name: "Software Design Methodologies",
  });
  expect(
    within(dialog).queryByRole("radio", { name: /S2 2026/ }),
  ).not.toBeInTheDocument();
  expect(within(dialog).getByRole("radio", { name: /S1 2027/ })).toBeChecked();
  expect(
    within(dialog).getByText(/Prerequisites done before S1 2027/),
  ).toBeVisible();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Add to S1 2027" }),
  );
  expect(onAdd).toHaveBeenCalledWith("2027-s1");
});

test("a missing prerequisite can be added from the sheet, which names the course it came from", async () => {
  const { onAddPrerequisite } = sheet([], { parentCode: "COMP3600" });
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Prerequisite for COMP3600")).toBeVisible();
  expect(within(dialog).getByText(/Still needed before S1 2026/)).toBeVisible();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Add COMP1110 first" }),
  );
  expect(onAddPrerequisite).toHaveBeenCalledWith(course("COMP1110"));
});

test("choosing a full semester warns of the overload and still lets the student add it", async () => {
  const full = ["COMP1100", "MATH1005", "COMP1600", "COMP2400"].map(
    (code): Attempt => ({
      id: code,
      courseCode: code,
      termId: "2026-s1",
      academicYear: 2026,
      status: "planned",
    }),
  );
  const { onAdd } = sheet(full);
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("radio", { name: /S1 2026/ }));
  expect(
    within(dialog).getByText(/more than a full-time load of 24/),
  ).toBeVisible();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Add anyway to S1 2026" }),
  );
  expect(onAdd).toHaveBeenCalledWith("2026-s1");
});
