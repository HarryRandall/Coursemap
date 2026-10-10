import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { afterEach, expect, it, vi } from "vitest";
import type { CourseDetails } from "../lib/coursemap/course-types";
import { CourseDetailClient } from "../ui/courses/course-detail-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=student-review"),
}));
vi.mock("../app/providers", () => ({
  useCoursemap: () => ({
    state: { attempts: [], profile: { commencementYear: null } },
  }),
}));
vi.mock("../ui/shell", () => ({
  AppShell: ({ tabs, children }: { tabs: ReactNode; children: ReactNode }) => (
    <>
      {tabs}
      {children}
    </>
  ),
}));
vi.mock("../ui/overlays", () => ({ TermChooser: () => null }));
vi.mock("../ui/courses/course-plan-status", () => ({
  CoursePlanStatus: () => null,
  attemptForCourse: () => null,
}));
vi.mock("../ui/courses/requisite-diagram", () => ({
  RequisiteDiagram: () => null,
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ report }: { report: { courseCode: string } }) => (
      <p>Survey report for {report.courseCode}</p>
    ),
}));

const course: CourseDetails = {
  academicCareer: null,
  accent: "blue",
  areasOfInterest: [],
  tags: [],
  assessments: [],
  attributes: [],
  code: "COMP1100",
  college: null,
  name: "Programming",
  year: 2027,
  units: 6,
  unitValue: { kind: "fixed", units: 6 },
  eftsl: null,
  level: 1000,
  subject: "COMP",
  subjectName: null,
  school: "Computing",
  convener: "",
  sessions: [],
  offerings: [],
  offeringStatus: "offered",
  delivery: "In Person",
  introduction: null,
  description: "Programming",
  workloadText: null,
  workloadHours: null,
  inherentRequirements: null,
  prescribedTexts: null,
  fees: [],
  learningOutcomes: [],
  relatedCourses: [],
  prerequisiteText: "",
  assumedKnowledgeText: "",
  corequisiteText: "",
  permissionText: "",
  prerequisiteCodes: [],
  prerequisiteEdges: [],
  prerequisiteRule: null,
  availableCourseCodes: [],
  incompatibilityText: "",
  unlocksAreKnown: true,
  sourceUrl: "https://example.test/course",
  sourceUpdatedAt: null,
  publicationStatus: "published",
  reviewState: "verified",
};
function renderCourse() {
  return render(
    <TooltipProvider>
      <CourseDetailClient
        course={course}
        availableYears={[2027]}
        requisiteCompletion={{ completedCourses: [], isAuthenticated: false }}
      />
    </TooltipProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
it("keeps the review tab and shows a retryable error that recovers to a published report", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({ report: { courseCode: "COMP1100", surveys: [] } }),
    );
  vi.stubGlobal("fetch", fetcher);
  renderCourse();
  expect(screen.getByRole("tab", { name: "Student review" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Student survey results could not be loaded.",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Survey report for COMP1100")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("shows loading in the review area and hides the tab only after a confirmed missing report", async () => {
  let resolveRequest!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    ),
  );
  renderCourse();
  expect(screen.getByRole("tab", { name: "Student review" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading survey charts...",
  );
  await act(async () => resolveRequest(Response.json({ report: null })));
  await waitFor(() =>
    expect(
      screen.queryByRole("tab", { name: "Student review" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
