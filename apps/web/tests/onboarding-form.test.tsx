import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";

const actions = vi.hoisted(() => ({ saveProfileAndPlan: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/coursemap/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", () => ({ default: () => null }));

// cmdk scrolls the active option into view, which jsdom does not implement.
Element.prototype.scrollIntoView = () => {};

const programme = (catalogueYear: number) => ({
  catalogueYear,
  code: "AACOM",
  description: "",
  durationYears: 3,
  majorCodes: ["COMP-MAJ"],
  minorCodes: [],
  name: "Bachelor of Advanced Computing",
  specialisationCodes: [],
  units: 144,
});

const catalogue: OnboardingCatalogue = {
  catalogueYears: [
    { id: 2, year: 2026 },
    { id: 1, year: 2024 },
  ],
  degrees: [programme(2026), programme(2024)],
  majors: [
    {
      ...programme(2024),
      code: "COMP-MAJ",
      name: "Computer Science",
      majorCodes: [],
    },
  ],
  minors: [],
  specialisations: [],
};

beforeEach(() => vi.resetAllMocks());

function renderForm() {
  return render(
    <OnboardingForm
      catalogue={catalogue}
      currentYear={2026}
      email="s@x.test"
    />,
  );
}

test("walks through every step and saves the start year as the commencement year", async () => {
  const user = userEvent.setup();
  actions.saveProfileAndPlan.mockResolvedValue({ ok: true, message: "Saved" });
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Ada");
  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(
    screen.getByRole("heading", { name: "When did you start at ANU?" }),
  ).toHaveFocus();

  await user.click(screen.getByRole("radio", { name: "2025" }));
  expect(
    screen.getByText(/doesn't have the 2025 degree rules yet/),
  ).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "2024" }));
  expect(screen.getByText(/follows the 2024 degree rules/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: /continue/i }));

  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Choose your degree to continue.",
  );
  await user.click(screen.getByLabelText("Degree"));
  await user.click(
    await screen.findByRole("button", { name: /Advanced Computing \(AACOM\)/ }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));

  await user.click(screen.getByRole("radio", { name: /Part time/ }));
  await user.click(screen.getByRole("button", { name: "Create my plan" }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/plan"));
  expect(actions.saveProfileAndPlan).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Ada",
      catalogueYear: 2024,
      commencementYear: 2024,
      degreeCode: "AACOM",
      studyLoad: "Part time",
    }),
  );
});

test("explains a missing name instead of relying on browser validation", async () => {
  const user = userEvent.setup();
  renderForm();
  await user.click(screen.getByRole("button", { name: /continue/i }));
  expect(screen.getByRole("alert")).toHaveTextContent("Add your name");
  expect(screen.getByLabelText("Name")).toHaveFocus();
  expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
});

test("keeps the answers and shows the reason when saving fails", async () => {
  const user = userEvent.setup();
  actions.saveProfileAndPlan.mockResolvedValue({
    ok: false,
    message: "Coursemap could not save your plan.",
  });
  renderForm();
  await user.type(screen.getByLabelText("Name"), "Ada");
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(screen.getByRole("radio", { name: /^2026/ }));
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(screen.getByLabelText("Degree"));
  await user.click(
    await screen.findByRole("button", { name: /Advanced Computing \(AACOM\)/ }),
  );
  await user.click(screen.getByRole("button", { name: /continue/i }));
  await user.click(screen.getByRole("button", { name: "Create my plan" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not save your plan",
  );
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create my plan" })).toBeEnabled();
});
