import { simulateOverlayAnimation } from "./helpers/overlay-animation";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AcademicRecord } from "@/app/academic/academic-record";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/academic/actions", () => ({
  saveAcademicResult: vi.fn().mockResolvedValue({
    ok: false,
    message: "Could not save.",
    detail: "Missing database function",
  }),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    notify: vi.fn(),
    state: {
      profile: { degreeCode: "", commencementYear: 2026, extensionYears: 0 },
      attempts: [
        {
          id: "attempt-one",
          courseCode: "COMP1000",
          termId: "2024-s1",
          status: "failed",
          mark: 0,
          resultCode: "NCN",
          unitsAttempted: 12,
        },
        {
          id: "attempt-two",
          courseCode: "COMP1000",
          termId: "2025-s2",
          status: "completed",
          mark: 80,
          unitsAttempted: 6,
        },
        {
          id: "future-plan",
          courseCode: "COMP2000",
          termId: "2099-s1",
          status: "planned",
        },
      ],
    },
  }),
}));
vi.mock("@/lib/coursemap/plan-timeline", () => ({
  planTimelineYears: () => [],
  planTimelineTerms: () => [],
}));
vi.mock("@/lib/planner", () => ({
  planningCourseForAttempt: (attempt: { courseCode: string }) => ({
    code: attempt.courseCode,
    name: "Course name",
  }),
  unitsForAttempt: (attempt: { unitsAttempted: number }) =>
    attempt.unitsAttempted,
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/ui/academic/previews/preview-layout", () => ({
  PreviewLayout: ({
    courses,
    onSelect,
  }: {
    courses: unknown;
    onSelect: (id: string) => void;
  }) => (
    <>
      <pre data-testid="record">{JSON.stringify(courses)}</pre>
      <button onClick={() => onSelect("attempt-one")}>Edit test result</button>
    </>
  ),
}));

test("academic page keeps real attempt IDs, grades, unit loads and periods while excluding future plans", () => {
  render(
    <AcademicRecord
      catalogue={{ degrees: [], terms: [] } as unknown as PlanCatalogue}
    />,
  );
  const courses = JSON.parse(screen.getByTestId("record").textContent ?? "[]");
  expect(courses).toHaveLength(2);
  expect(courses[0]).toMatchObject({
    id: "attempt-one",
    code: "COMP1000",
    term: "2024-s1",
    termLabel: "Sem 1 24",
    mark: 0,
    resultCode: "NCN",
    units: 12,
  });
  expect(courses[1]).toMatchObject({
    id: "attempt-two",
    code: "COMP1000",
    mark: 80,
    units: 6,
  });
});

test("save failures close the result form and display a toast", async () => {
  render(
    <AcademicRecord
      catalogue={{ degrees: [], terms: [] } as unknown as PlanCatalogue}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit test result" }));
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  await waitFor(() =>
    expect(toastError).toHaveBeenCalledWith(
      "Could not save",
      expect.objectContaining({
        description: expect.objectContaining({
          props: { text: "Missing database function" },
        }),
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save result" })).toBeNull(),
  );
});

for (const dismissal of ["Close", "Cancel", "Escape"]) {
  test(`${dismissal} removes the result dialog before its cleared content can animate`, async () => {
    const animation = simulateOverlayAnimation();
    try {
      render(
        <AcademicRecord
          catalogue={{ degrees: [], terms: [] } as unknown as PlanCatalogue}
        />,
      );
      const opener = screen.getByRole("button", { name: "Edit test result" });
      fireEvent.click(opener);
      const dialog = screen.getByRole("dialog");
      expect(
        screen.getByLabelText("Final mark for COMP1000"),
      ).toBeInTheDocument();
      if (dismissal === "Escape") {
        fireEvent.keyDown(dialog, { key: "Escape" });
      } else {
        fireEvent.click(screen.getByRole("button", { name: dismissal }));
      }
      expect(dialog).not.toBeInTheDocument();
      expect(screen.queryByText("No course selected.")).not.toBeInTheDocument();
      fireEvent.click(opener);
      expect(
        screen.getByLabelText("Final mark for COMP1000"),
      ).toBeInTheDocument();
    } finally {
      animation.mockRestore();
    }
  });
}
