import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { ProfileEditor } from "@/app/profile/profile-editor";
import type { AppState } from "@/lib/coursemap/types";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";

const mocks = vi.hoisted(() => ({
  state: {} as AppState,
  updateProfile: vi.fn(),
}));
vi.mock("@/app/providers", () => ({
  useCoursemap: () => ({
    state: mocks.state,
    ready: true,
    guest: false,
    notify: vi.fn(),
    updateProfile: mocks.updateProfile,
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=study"),
}));
vi.mock("@/ui/shell", () => ({
  AppShell: ({ children, tabs }: { children: ReactNode; tabs: ReactNode }) => (
    <main>
      {tabs}
      {children}
    </main>
  ),
}));
vi.mock("@/ui/shell/account-appearance", () => ({
  AccountAppearance: () => null,
}));

function option(
  code: string,
  name: string,
  overrides: Partial<ProgrammeOption> = {},
): ProgrammeOption {
  return {
    code,
    name,
    catalogueYear: 2026,
    description: "",
    durationYears: null,
    units: 48,
    majorCodes: [],
    minorCodes: [],
    specialisationCodes: [],
    ...overrides,
  };
}

const catalogue = {
  catalogueYears: [{ id: 1, year: 2026 }],
  degrees: [
    option("BCOMP", "Bachelor of Computing", {
      durationYears: 3,
      units: 144,
      majorCodes: ["INFS-MAJ", "SOFT-MAJ"],
      minorCodes: ["MATH-MIN", "STAT-MIN"],
    }),
    option("BARTS", "Bachelor of Arts", { durationYears: 3, units: 144 }),
    option("HACCT", "Bachelor of Accounting (Honours)", {
      durationYears: 1,
      units: 48,
    }),
  ],
  majors: [
    option("INFS-MAJ", "Information Systems"),
    option("SOFT-MAJ", "Software Development"),
  ],
  minors: [
    option("MATH-MIN", "Mathematics", { units: 24 }),
    option("STAT-MIN", "Statistics", { units: 24 }),
  ],
  specialisations: [],
};

beforeEach(() => {
  mocks.updateProfile.mockReset();
  mocks.state = {
    schemaVersion: 1,
    planId: "plan-a",
    attempts: [],
    profile: {
      name: "Student",
      studentId: "",
      email: "student@example.test",
      commencementYear: 2026,
      catalogueYear: 2026,
      degreeCode: "BCOMP",
      majorCode: "",
      minorCodes: ["MATH-MIN"],
      specialisationCodes: [],
      studyLoad: "Full time",
      extensionYears: 0,
    },
  };
});

test("the course of study shows what is chosen, not the whole catalogue", () => {
  render(<ProfileEditor catalogue={catalogue} />);
  expect(
    screen.getByRole("heading", { name: /^Bachelor of Computing/u }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Finishes end of 2028/u)).toBeInTheDocument();
  // The chosen minor is named in its row and in the legend; the rest of the
  // catalogue is not on the page at all.
  expect(screen.getAllByText("Mathematics")).toHaveLength(2);
  expect(screen.queryByText("Statistics")).toBeNull();
  expect(screen.queryByText("Software Development")).toBeNull();
  expect(
    screen.getByRole("button", { name: /Add a major/u }),
  ).toBeInTheDocument();
  const legend = screen.getByRole("img", { name: /24 of 144 units/u });
  expect(legend).toBeInTheDocument();
  expect(screen.getByText("Core and electives")).toBeInTheDocument();
});

test("a major is picked from a searchable list and shows as unsaved", async () => {
  render(<ProfileEditor catalogue={catalogue} />);
  await userEvent.click(screen.getByRole("button", { name: /Add a major/u }));
  const dialog = screen.getByRole("dialog", { name: "Choose a major" });
  await userEvent.type(
    within(dialog).getByRole("textbox", { name: "Search majors" }),
    "soft",
  );
  expect(within(dialog).queryByText("Information Systems")).toBeNull();
  await userEvent.click(
    within(dialog).getByRole("button", { name: /Software Development/u }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getAllByText("Software Development").length).toBeGreaterThan(0);
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Change major" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: /Software Development/u,
      pressed: true,
    }),
  ).toBeInTheDocument();
});

test("minors are ticked together and confirmed, and removed from their row", async () => {
  render(<ProfileEditor catalogue={catalogue} />);
  await userEvent.click(
    screen.getByRole("button", { name: /Add another minor/u }),
  );
  const dialog = screen.getByRole("dialog", { name: "Choose minors" });
  expect(
    within(dialog).getByRole("button", { name: /Mathematics/u, pressed: true }),
  ).toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole("button", { name: /Statistics/u }),
  );
  expect(within(dialog).getByText("2 chosen")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.getAllByText("Statistics").length).toBeGreaterThan(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Remove Mathematics" }),
  );
  expect(screen.queryByText("Mathematics")).toBeNull();
  expect(
    screen.getByRole("button", { name: /Add another minor/u }),
  ).toBeInTheDocument();
});

test("a chosen major can be removed again", async () => {
  mocks.state.profile.majorCode = "SOFT-MAJ";
  render(<ProfileEditor catalogue={catalogue} />);
  // Catalogue pages open in a new tab, so the unsaved draft survives.
  for (const link of screen.getAllByRole("link", { name: /opens in a new tab/u }))
    expect(link).toHaveAttribute("target", "_blank");
  await userEvent.click(
    screen.getByRole("button", { name: "Remove Software Development" }),
  );
  expect(screen.queryByText("Software Development")).toBeNull();
  expect(
    screen.getByRole("button", { name: /Add a major/u }),
  ).toBeInTheDocument();
});

test("the enrolment mode is worked out from the degree when saving", async () => {
  mocks.updateProfile.mockResolvedValue({ ok: true, message: "Saved" });
  render(<ProfileEditor catalogue={catalogue} />);
  expect(screen.queryByText("Enrolment mode")).toBeNull();
  await userEvent.click(screen.getByRole("radio", { name: "Part time" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(mocks.updateProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      studyLoad: "Part time",
      enrolmentMode: "single_degree",
    }),
  );
});

test("one-year programmes stay out of the degree list until filtered for", async () => {
  render(<ProfileEditor catalogue={catalogue} />);
  await userEvent.click(screen.getByRole("button", { name: "Change degree" }));
  const dialog = screen.getByRole("dialog", { name: "Change degree" });
  expect(within(dialog).getByText("Bachelor of Arts")).toBeInTheDocument();
  expect(
    within(dialog).queryByText("Bachelor of Accounting (Honours)"),
  ).toBeNull();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "One-year" }),
  );
  expect(
    within(dialog).getByText("Bachelor of Accounting (Honours)"),
  ).toBeInTheDocument();
  expect(within(dialog).queryByText("Bachelor of Arts")).toBeNull();
  await userEvent.click(
    within(dialog).getByRole("button", { name: "One-year" }),
  );
  // The chosen minor would be cleared, so the switch is confirmed first.
  await userEvent.click(
    within(dialog).getByRole("button", { name: /Bachelor of Arts/u }),
  );
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "Switching clears your Mathematics minor.",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Switch to BARTS" }),
  );
  expect(
    screen.getByRole("heading", { name: /^Bachelor of Arts/u }),
  ).toBeInTheDocument();
  // Changing degree clears the structures chosen under the old one.
  expect(screen.queryByText("Mathematics")).toBeNull();
});
