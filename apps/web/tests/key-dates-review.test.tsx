import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { diffUniversityCalendarReview } from "@/lib/coursemap/university-calendar-review";
import type { KeyDatesReview } from "@/lib/admin/key-dates";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const approveKeyDatesReviewAction = vi.fn(async () => ({
  ok: true,
  message: "Key dates for 2027 are published.",
}));
const discardKeyDatesReviewAction = vi.fn();
vi.mock("@/lib/admin/key-dates-actions", () => ({
  approveKeyDatesReviewAction,
  discardKeyDatesReviewAction,
}));

const { KeyDatesReviewPanel } =
  await import("@/ui/admin/key-dates/key-dates-review");

function review(overrides: Partial<KeyDatesReview> = {}): KeyDatesReview {
  return {
    id: "3f0a5a1e-2c43-4c1f-9d3f-0e0a1b2c3d4e",
    canonicalUrl:
      "https://www.anu.edu.au/directories/university-calendar?year=2027",
    fetchedAt: "2026-09-26T01:00:00.000Z",
    requestedAt: "2026-09-26T01:00:00.000Z",
    events: [
      { date: "2027-02-22", title: "Semester 1 begins" },
      { date: "2027-06-03", title: "Examination period begins" },
    ],
    diagnostics: [],
    ...overrides,
  };
}

function renderPanel(value: KeyDatesReview) {
  return render(
    <TooltipProvider>
      <KeyDatesReviewPanel
        canManage
        diff={diffUniversityCalendarReview(value.events, [
          { date: "2027-02-22", title: "Semester 1 begins" },
          { date: "2027-03-31", title: "Census date" },
        ])}
        review={value}
        year={2027}
      />
    </TooltipProvider>,
  );
}

test("the review opens on what approval changes and publishes on confirmation", async () => {
  const user = userEvent.setup();
  renderPanel(review());

  const changes = screen.getByRole("tabpanel");
  expect(within(changes).getByText("Examination period begins")).toBeVisible();
  expect(within(changes).getByText("Census date")).toBeVisible();
  expect(within(changes).queryByText("Semester 1 begins")).toBeNull();
  expect(screen.getByText("1 new")).toBeVisible();
  expect(screen.getByText("1 removed")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Approve and publish" }));
  await user.click(screen.getByRole("button", { name: "Publish" }));

  expect(approveKeyDatesReviewAction).toHaveBeenCalledWith(
    "3f0a5a1e-2c43-4c1f-9d3f-0e0a1b2c3d4e",
    2027,
  );
  expect(push).toHaveBeenCalledWith("/admin/key-dates/2027");
});

test("a sync with source errors cannot be published", () => {
  renderPanel(
    review({
      diagnostics: [
        {
          code: "CALENDAR_TABLE_MISSING",
          severity: "error",
          message: "No calendar event rows were found.",
        },
      ],
    }),
  );

  expect(screen.getByText("No calendar event rows were found.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Approve and publish" }),
  ).toBeDisabled();
});

test("parser warnings start folded away", async () => {
  const user = userEvent.setup();
  renderPanel(
    review({
      diagnostics: [
        {
          code: "CALENDAR_EVENT_DUPLICATE",
          severity: "warning",
          message: "The calendar event appears more than once.",
        },
      ],
    }),
  );

  expect(
    screen.queryByText("The calendar event appears more than once."),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Show" }));
  expect(
    screen.getByText("The calendar event appears more than once."),
  ).toBeVisible();
});
