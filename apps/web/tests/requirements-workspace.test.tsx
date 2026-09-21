import type { ReactElement, ReactNode } from "react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  render as renderUi,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Requirements } from "@/app/requirements/requirements";
import type {
  PlanCatalogue,
  PlanRequirementCondition,
  PlanRequirementGroup,
} from "@/lib/coursemap/plan-catalogue";
import type {
  OnboardingCatalogue,
  ProgrammeOption,
} from "@/lib/coursemap/onboarding-catalogue";
import type { AppState } from "@/app/providers";
import { requirementCourseStatus } from "@/lib/coursemap/requirement-display";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";

import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";

function render(ui: ReactElement) {
  return renderUi(<TooltipProvider>{ui}</TooltipProvider>);
}

const actions = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  addCourse: vi.fn(),
  notify: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
  usePathname: () => "/requirements",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children, tabs }: { children: ReactNode; tabs: ReactNode }) => (
    <main>
      {tabs}
      {children}
    </main>
  ),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({ state, ...actions }),
}));
const state: AppState = {
  schemaVersion: 1,
  profile: {
    name: "Test Student",
    studentId: "",
    email: "student@example.test",
    commencementYear: 2026,
    catalogueYear: 2026,
    degreeCode: "BCOMP",
    majorCode: "",
    minorCodes: ["BISM-MIN"],
    specialisationCodes: [],
    studyLoad: "Full time",
    extensionYears: 0,
  },
  attempts: [],
};
const condition: PlanRequirementCondition = {
  type: "condition",
  id: 1,
  conditionKind: "course_set_units",
  freeText: null,
  maximumLevel: null,
  maximumUnits: null,
  minimumCourses: 1,
  minimumLevel: null,
  minimumUnits: 6,
  options: [
    { code: "COMP1100", kind: "course", position: 1, structureKind: null },
    { code: "COMP1110", kind: "course", position: 2, structureKind: null },
  ],
  position: 1,
  projectionKey: "courses",
  sourceLocator: "#source",
  sourceText: "Original catalogue wording",
  structureKind: null,
  subjectCode: null,
  tag: null,
};
const root: PlanRequirementGroup = {
  type: "group",
  id: 1,
  children: [condition],
  description: null,
  groupKey: "root",
  maximumUnits: null,
  minimumCount: null,
  minimumUnits: null,
  operator: "all_of",
  position: 1,
  sourceLocator: "#source",
  sourceText: "Original group wording",
  title: "Complete every item",
};
const catalogue: PlanCatalogue = {
  academicYear: 2026,
  courses: ["COMP1100", "COMP1110"].map((code) => ({
    code,
    name: `Course ${code}`,
    year: 2026,
    units: 6,
    level: 1000,
    subject: "COMP",
    school: "Computing",
    convener: "",
    sessions: ["Semester 1"],
    delivery: "In Person",
    description: "",
    prerequisiteText: "",
    prerequisiteCodes: [],
    incompatibilities: [],
    countsTowards: [],
    sourceUrl: "https://programsandcourses.anu.edu.au",
    lastChanged: "",
    parseState: "Verified",
    accent: "violet",
  })),
  terms: [],
  degrees: [
    {
      code: "BCOMP",
      name: "Computing",
      units: 144,
      duration: 3,
      college: "",
      description: "",
    },
  ],
  majors: [],
  structures: [
    { code: "BCOMP", name: "Computing", kind: "programme" },
    { code: "BISM-MIN", name: "Business Information Systems", kind: "minor" },
  ],
  programmeRequirementsImported: true,
  structureRequirements: [
    {
      root,
      snapshotId: 1,
      structureCode: "BCOMP",
      structureKind: "programme",
      structureName: "Computing",
      unmodelled: [],
    },
    {
      root,
      snapshotId: 2,
      structureCode: "BISM-MIN",
      structureKind: "minor",
      structureName: "Business Information Systems",
      unmodelled: [],
    },
  ],
};
const option = (code: string, name: string): ProgrammeOption => ({
  code,
  name,
  catalogueYear: 2026,
  description: "Explore this field of study.",
  durationYears: null,
  units: 24,
  majorCodes: [],
  minorCodes: [],
  specialisationCodes: [],
});
const choices: OnboardingCatalogue = {
  catalogueYears: [{ id: 1, year: 2026 }],
  degrees: [
    {
      ...option("BCOMP", "Computing"),
      units: 144,
      majorCodes: ["SOFT-MAJ"],
      minorCodes: ["BISM-MIN", "MATH-MIN"],
      specialisationCodes: [],
    },
  ],
  majors: [
    option("SOFT-MAJ", "Software Development"),
    option("OTHER-MAJ", "Unrelated major"),
  ],
  minors: [
    option("BISM-MIN", "Business Information Systems"),
    option("MATH-MIN", "Mathematics"),
  ],
  specialisations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.attempts = [];
  actions.updateProfile.mockResolvedValue({ ok: true, message: "Saved" });
  actions.addCourse.mockResolvedValue({ ok: true, message: "Added" });
});
afterEach(() => vi.unstubAllGlobals());

test("requirements use separate tabs without source disclosures or the summary sidebar", async () => {
  const user = userEvent.setup();
  render(<Requirements catalogue={catalogue} choices={choices} />);
  expect(screen.getByRole("tab", { name: "Degree" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.queryByText(
      /ANU source wording|Structured interpretation|Complete every item|Original catalogue wording|Courses in your plan|Rules at a glance/,
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: /Choose 1 course/ }),
  ).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Minors" }));
  expect(
    screen.getByRole("heading", { name: /Business Information Systems/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Computing progress" }),
  ).toBeVisible();
});

test("eligible major cards save through the existing profile action", async () => {
  const user = userEvent.setup();
  render(<Requirements catalogue={catalogue} choices={choices} />);
  await user.click(screen.getByRole("tab", { name: "Major" }));
  expect(screen.getByText("No major selected yet")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Choose a major" }));
  expect(
    screen.getByRole("heading", { name: "Software Development" }),
  ).toBeVisible();
  expect(screen.queryByText("Unrelated major")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Choose major.*Software Development/ }),
  );
  await waitFor(() =>
    expect(actions.updateProfile).toHaveBeenCalledWith({
      majorCode: "SOFT-MAJ",
    }),
  );
  expect(actions.refresh).toHaveBeenCalled();
});

test("adding a minor preserves the existing minor and failed saves keep the choices open", async () => {
  const user = userEvent.setup();
  actions.updateProfile.mockResolvedValueOnce({
    ok: false,
    message: "Could not save",
  });
  render(<Requirements catalogue={catalogue} choices={choices} />);
  await user.click(screen.getByRole("tab", { name: "Minors" }));
  await user.click(screen.getByRole("button", { name: "Add minor" }));
  await user.click(
    screen.getByRole("button", { name: /Choose minor.*Mathematics/ }),
  );
  await waitFor(() =>
    expect(actions.updateProfile).toHaveBeenCalledWith({
      minorCodes: ["BISM-MIN", "MATH-MIN"],
    }),
  );
  expect(actions.notify).toHaveBeenCalledWith("Could not save", "warning");
  expect(
    screen.getByRole("button", { name: /Choose minor.*Mathematics/ }),
  ).toBeVisible();
});

test("a course opens the semester chooser and is saved in the selected year", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        terms: [
          {
            id: "2026-s1",
            name: "Semester 1",
            year: 2026,
            dates: "February to June",
          },
        ],
      }),
    }),
  );
  render(<Requirements catalogue={catalogue} choices={choices} />);
  await user.click(screen.getByRole("button", { name: /View courses/ }));
  expect(screen.getByRole("link", { name: /COMP1100/ })).toHaveAttribute(
    "href",
    "/courses/2026/comp1100",
  );
  await user.click(
    screen.getByRole("button", { name: "Add COMP1100 to plan" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("button", { name: /Semester 1 2026/ }),
  );
  await waitFor(() =>
    expect(actions.addCourse).toHaveBeenCalledWith("COMP1100", "2026-s1", 2026),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

test("completed study takes precedence over a planned repeat and existing courses are not offered for adding", async () => {
  const user = userEvent.setup();
  state.attempts = [
    {
      id: "done",
      courseCode: "COMP1100",
      termId: "2026-s1",
      status: "completed",
    },
    {
      id: "repeat",
      courseCode: "COMP1100",
      termId: "2026-s2",
      status: "planned",
    },
    {
      id: "planned",
      courseCode: "COMP1110",
      termId: "2026-s2",
      status: "planned",
    },
  ];
  expect(requirementCourseStatus("COMP1100", state.attempts)).toBe("completed");
  render(<Requirements catalogue={catalogue} choices={choices} />);
  await user.click(screen.getByRole("button", { name: /View courses/ }));
  const done = screen.getByRole("link", { name: /COMP1100/ }).closest("li")!;
  expect(within(done).getByText("Completed")).toBeVisible();
  expect(done).toHaveClass("bg-success/5");
  const planned = screen.getByRole("link", { name: /COMP1110/ }).closest("li")!;
  expect(within(planned).getByText("Planned")).toBeVisible();
  expect(planned).toHaveClass("bg-primary/5");
  expect(
    screen.queryByRole("button", { name: /Add COMP/ }),
  ).not.toBeInTheDocument();
});

test("alternative groups and upper limits remain explicit after simplifying wrappers", () => {
  render(
    <RequirementGroupView
      group={{
        ...root,
        operator: "any_of",
        maximumUnits: 12,
        children: [condition, { ...condition, id: 2 }],
      }}
      context={{
        catalogue,
        attemptStatusByCode: new Map(),
        selectedStructureCodes: new Set(),
        progress: new Map(),
      }}
    />,
  );
  expect(screen.getByText("Choose one of these options")).toBeVisible();
  expect(
    screen.getByText("Up to 12 units across the following requirements"),
  ).toBeVisible();
  expect(screen.getByText("or")).toBeVisible();
});

test("unpublished requirement courses are disabled and retain planned status", async () => {
  const user = userEvent.setup();
  state.attempts = [
    {
      id: "planned",
      courseCode: "COMP1100",
      termId: "2026-s1",
      status: "planned",
    },
  ];
  render(
    <Requirements
      catalogue={{ ...catalogue, courses: [] }}
      choices={choices}
    />,
  );
  await user.click(screen.getByRole("button", { name: /View courses/ }));
  const course = screen.getByRole("button", {
    name: "COMP1100: not available",
  });
  expect(course).toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const row = course.closest("li")!;
  expect(within(row).getByText("Planned")).toBeVisible();
  expect(
    within(row).queryByRole("button", { name: /Add .* to plan/ }),
  ).not.toBeInTheDocument();
});

test("degree requirements do not repeat structure selection cards", () => {
  const { container } = render(
    <RequirementGroupView
      group={{
        ...root,
        children: [
          {
            ...condition,
            conditionKind: "structure_set",
            structureKind: "major",
          },
        ],
      }}
      context={{
        catalogue,
        attemptStatusByCode: new Map(),
        selectedStructureCodes: new Set(),
        progress: new Map(),
      }}
    />,
  );
  expect(container).not.toHaveTextContent(/Choose.*major|Major/);
});

test("unavailable structures show illustrations without selection actions", async () => {
  const user = userEvent.setup();
  render(
    <Requirements
      catalogue={catalogue}
      choices={{ ...choices, majors: [], specialisations: [] }}
    />,
  );
  await user.click(screen.getByRole("tab", { name: "Major" }));
  expect(screen.getByText("No major options available")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Choose.*major/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Specialisations" }));
  expect(screen.getByText("No specialisation options available")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Choose.*specialisation/ }),
  ).not.toBeInTheDocument();
});

test("large requirement sections start collapsed and paginate without search", async () => {
  const user = userEvent.setup();
  const codes = Array.from({ length: 20 }, (_, index) => `COMP${2000 + index}`);
  render(
    <RequirementGroupView
      group={{
        ...root,
        children: [
          {
            ...condition,
            options: codes.map((code, position) => ({
              code,
              position,
              kind: "course" as const,
              structureKind: null,
            })),
          },
        ],
      }}
      context={{
        catalogue,
        attemptStatusByCode: new Map([["COMP2019", "planned" as const]]),
        selectedStructureCodes: new Set(),
        progress: new Map(),
      }}
    />,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", { name: /View courses/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.click(toggle);
  expect(screen.getAllByRole("button", { name: /not available/ })).toHaveLength(
    6,
  );
  expect(
    screen.getAllByRole("button", { name: /not available/ })[0],
  ).toHaveTextContent("COMP2019");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(
    screen.getByRole("navigation", { name: "courses pagination" }),
  ).toHaveTextContent("7–12 of 20");
  await user.click(screen.getByRole("button", { name: /Page\s*4/ }));
  expect(screen.getAllByRole("button", { name: /not available/ })).toHaveLength(
    2,
  );
  expect(
    screen.getByRole("navigation", { name: "courses pagination" }),
  ).toHaveTextContent("19–20 of 20");
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Hide courses/ }));
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});
