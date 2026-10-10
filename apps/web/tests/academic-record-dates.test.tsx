import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AcademicRecord } from "@/app/academic/academic-record";
import type { Attempt, Term } from "@/lib/coursemap/types";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";

const mocks = vi.hoisted(() => ({
  attempts: [] as Attempt[],
  terms: [] as Term[],
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: {
      profile: { degreeCode: "", commencementYear: 2026, extensionYears: 0 },
      attempts: mocks.attempts,
    },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/coursemap/plan-timeline", () => ({
  planTimelineYears: () => [],
  planTimelineTerms: () => mocks.terms,
}));
vi.mock("@/lib/planner", () => ({
  planningCourseForAttempt: (attempt: Attempt) => ({
    code: attempt.courseCode,
    name: "Course",
  }),
  unitsForAttempt: () => 6,
}));
vi.mock("@/ui/academic/previews/preview-layout", () => ({
  PreviewLayout: ({ courses }: { courses: { code: string }[] }) => (
    <div>{courses.map((course) => course.code).join(",")}</div>
  ),
}));
afterEach(() => vi.useRealTimers());
const catalogue = {
  academicYear: 2026,
  degrees: [],
  courses: [],
  terms: [],
  majors: [],
  structures: [],
  structureRequirements: [],
  programmeRequirementsImported: false,
} satisfies PlanCatalogue;
test("planned academic results become current at Sydney's term boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-26T14:05:00Z"));
  mocks.terms = [
    {
      id: "2026-s2",
      year: 2026,
      name: "Second Semester",
      shortName: "Semester 2",
      dates: "",
      startsOn: "2026-07-27",
      endsOn: "2026-10-30",
    },
  ];
  mocks.attempts = [
    {
      id: "course",
      courseCode: "COMP1100",
      status: "planned",
      termId: "2026-s2",
    },
  ];
  render(<AcademicRecord catalogue={catalogue} todayIso="2026-07-27" />);
  expect(screen.getByText("COMP1100")).toBeInTheDocument();
});
test("undated academic periods use Sydney's semester at the July boundary", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-30T14:05:00Z"));
  mocks.terms = [];
  mocks.attempts = [
    {
      id: "first",
      courseCode: "COMP1100",
      status: "planned",
      termId: "2026-s1",
    },
    {
      id: "second",
      courseCode: "COMP1110",
      status: "planned",
      termId: "2026-s2",
    },
  ];
  render(<AcademicRecord catalogue={catalogue} todayIso="2026-07-01" />);
  expect(screen.getByText("COMP1110")).toBeInTheDocument();
  expect(screen.queryByText("COMP1100")).not.toBeInTheDocument();
});
