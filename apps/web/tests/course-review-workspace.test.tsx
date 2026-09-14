import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { extractDeterministicCourse } from "@/lib/course-import/deterministic";
import { projectCourseSnapshot } from "@/lib/course-import/project-snapshot";
import {
  courseSectionFingerprint,
  courseReviewIssueSection,
} from "@/lib/coursemap/course-review-sections";
import { CourseDataSections } from "@/ui/admin/courses/course-data-sections";
import { CourseReviewSidebar } from "@/ui/admin/courses/course-review-sidebar";
import { CourseImportEmpty } from "@/ui/admin/courses/course-import-empty";
import type { AdminCourseYearRecord } from "@/lib/coursemap/admin-course-year";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const projection = projectCourseSnapshot(
  extractDeterministicCourse({
    html: readFileSync(
      resolve("tests/fixtures/course-import/anu-2026-comp2400-rich.html"),
      "utf8",
    ),
    courseCode: "COMP2400",
    year: 2026,
    sourceUrl: "https://programsandcourses.anu.edu.au/2026/course/COMP2400",
  }),
);
const record = {
  code: "COMP2400",
  year: 2026,
  projection,
  evidence: [],
  sourceOriginalProjection: projection,
  sourcePage: {
    canonical_url: "https://programsandcourses.anu.edu.au/2026/course/COMP2400",
  },
  publishedProjection: null,
} as unknown as AdminCourseYearRecord;

describe("course section review", () => {
  test("shows only the selected section, folds evidence inline and locks navigation while editing", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <CourseReviewSidebar
        active="overview"
        onSelect={onSelect}
        disabled={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Course preview" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Requisites" }));
    expect(onSelect).toHaveBeenCalledWith("requisites");
    rerender(
      <CourseReviewSidebar active="overview" onSelect={onSelect} disabled />,
    );
    expect(screen.getByRole("button", { name: "Requisites" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Overview" })).toBeEnabled();
  });
  test("edits one section and preserves the other course data", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDataSections
        sectionKey="overview"
        canEdit
        onSave={saved}
        record={record}
      />,
    );
    expect(
      screen.queryByRole("heading", { name: "Assessment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ANU text" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Source evidence")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Reviewed title",
    );
    await user.click(screen.getByRole("button", { name: "Save section" }));
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentItems: projection.assessmentItems,
        snapshot: expect.objectContaining({ title: "Reviewed title" }),
      }),
    );
  });
  test("invalidates only the sections whose content changed, including linked unit options", () => {
    const changed = structuredClone(projection);
    changed.snapshot.title = "Changed";
    expect(courseSectionFingerprint("overview", changed)).not.toBe(
      courseSectionFingerprint("overview", projection),
    );
    expect(courseSectionFingerprint("assessment", changed)).toBe(
      courseSectionFingerprint("assessment", projection),
    );
    changed.unitOptions.push({
      position: 1,
      units: 12,
      label: null,
      sourceText: "12 units",
    });
    expect(courseSectionFingerprint("units", changed)).not.toBe(
      courseSectionFingerprint("units", projection),
    );
  });
  test("places source issues in their relevant sections", () => {
    expect(courseReviewIssueSection("rules.prerequisite")).toBe("requisites");
    expect(courseReviewIssueSection("snapshot.workloadText")).toBe("teaching");
    expect(courseReviewIssueSection("assessmentItems[1].weight")).toBe(
      "assessment",
    );
  });
  test("unimported courses expose an import action without a projection", () => {
    render(<CourseImportEmpty code="COMP2400" year={2026} canImport />);
    expect(
      screen.getByRole("heading", { name: "No imports yet" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Import course" })).toBeEnabled();
  });
});
