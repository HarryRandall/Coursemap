import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import type { CourseDetails } from "@/lib/coursemap/course-types";
import {
  StudentViewPanel,
  type StudentPreviewSource,
} from "@/ui/admin/catalogue/student-view-panel";

vi.mock("@/ui/admin/catalogue/version-preview", () => ({
  CoursePreview: ({ course }: { course: CourseDetails }) => (
    <div data-testid="course-preview">{course.description}</div>
  ),
  StructurePreview: () => <div data-testid="structure-preview" />,
}));

function source(description: string): StudentPreviewSource {
  return {
    course: { description } as CourseDetails,
    content: null,
  };
}

test("the draft leads, because that is the question being asked", () => {
  render(
    <StudentViewPanel
      draft={source("Draft wording")}
      kindLabel="course"
      published={source("Published wording")}
    />,
  );
  expect(screen.getByTestId("course-preview").textContent).toBe(
    "Draft wording",
  );
  expect(screen.getByRole("tab", { name: "Draft" }).dataset.state).toBe(
    "active",
  );
});

test("the published version is one keyboard-reachable control away", () => {
  render(
    <StudentViewPanel
      draft={source("Draft wording")}
      kindLabel="course"
      published={source("Published wording")}
    />,
  );
  // Radix tab triggers act on pointer down, not on a synthetic click alone.
  const published = screen.getByRole("tab", { name: "Published" });
  fireEvent.pointerDown(published, { button: 0, ctrlKey: false });
  fireEvent.mouseDown(published, { button: 0, ctrlKey: false });
  expect(screen.getByTestId("course-preview").textContent).toBe(
    "Published wording",
  );
  expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
    "Preview content",
  );
});

test("an unpublished record shows its draft without a dead control", () => {
  render(
    <StudentViewPanel
      draft={source("Draft wording")}
      kindLabel="course"
      published={null}
    />,
  );
  expect(screen.getByTestId("course-preview").textContent).toBe(
    "Draft wording",
  );
  expect(screen.queryByRole("tab")).toBeNull();
});

test("a record with no draft shows the publication without a dead control", () => {
  render(
    <StudentViewPanel
      draft={null}
      kindLabel="course"
      published={source("Published wording")}
    />,
  );
  expect(screen.getByTestId("course-preview").textContent).toBe(
    "Published wording",
  );
  expect(screen.queryByRole("tab")).toBeNull();
});

test("a record with neither says what would fill it", () => {
  render(<StudentViewPanel draft={null} kindLabel="course" published={null} />);
  expect(screen.getByText("Nothing to preview yet")).toBeTruthy();
});
