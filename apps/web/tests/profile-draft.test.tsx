import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { ProfileEditor } from "@/app/profile/profile-editor";
import type { AppState } from "@/lib/coursemap/types";

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
vi.mock("@/ui/shell/account-appearance", () => ({
  AccountAppearance: () => null,
}));
const catalogue = {
  catalogueYears: [],
  degrees: [],
  majors: [],
  minors: [],
  specialisations: [],
};
beforeEach(() => {
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
      degreeCode: "",
      majorCode: "",
      minorCodes: [],
      specialisationCodes: [],
      studyLoad: "Full time",
      extensionYears: 0,
    },
  };
});
test("an updated profile prop preserves unsaved form input", async () => {
  const view = render(<ProfileEditor catalogue={catalogue} />);
  const input = screen.getByRole("textbox", { name: "Name" });
  await userEvent.clear(input);
  await userEvent.type(input, "Unsaved name");
  mocks.state = {
    ...mocks.state,
    profile: { ...mocks.state.profile, pronouns: "they/them" },
  };
  view.rerender(<ProfileEditor catalogue={catalogue} />);
  await act(async () => {});
  expect(input).toHaveValue("Unsaved name");
});
test("switching plans initialises a new profile draft", async () => {
  const view = render(<ProfileEditor catalogue={catalogue} />);
  await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
  mocks.state = {
    ...mocks.state,
    planId: "plan-b",
    profile: { ...mocks.state.profile, name: "Another student" },
  };
  view.rerender(<ProfileEditor catalogue={catalogue} />);
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Another student",
  );
});

test("a successful save adopts the normalised student number", async () => {
  mocks.state.profile.degreeCode = "BCOMP";
  mocks.updateProfile.mockImplementation(
    async (profile: AppState["profile"]) => {
      mocks.state = { ...mocks.state, profile };
      return { ok: true, message: "Saved." };
    },
  );
  render(
    <ProfileEditor
      catalogue={{
        ...catalogue,
        degrees: [
          {
            code: "BCOMP",
            name: "Computing",
            catalogueYear: 2026,
            durationYears: 3,
            units: 144,
            description: "",
            majorCodes: [],
            minorCodes: [],
            specialisationCodes: [],
          },
        ],
      }}
    />,
  );
  const input = screen.getByRole("textbox", { name: "Student number" });
  await userEvent.type(input, "U1234567");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(mocks.updateProfile).toHaveBeenCalled();
  expect(input).toHaveValue("u1234567");
  expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
});
