import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import type {
  SourceReview,
  SourceReviewChange,
} from "@/lib/catalogue/source-review-store";
import { summariseReviewNotes } from "@/lib/catalogue/review-notes";
import { CatalogueChangesPanel } from "@/ui/admin/catalogue/changes/changes-panel";

const actions = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/lib/coursemap/admin-catalogue-actions", () => ({
  resolveSourceChangeAction: actions.resolve,
  approveFirstReadAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function change(overrides: Partial<SourceReviewChange> = {}) {
  return {
    id: 1,
    fieldPath: "course.details.description",
    label: "Description",
    unitKind: "scalar",
    classification: "source_change",
    hasBaseSource: true,
    baseSourceValue: "Previous ANU wording",
    localValue: "Previous ANU wording",
    incomingSourceValue: "New ANU wording",
    isStale: false,
    decision: null,
    resolvedAt: null,
    confidence: null,
    band: null,
    reason: null,
    ...overrides,
  } satisfies SourceReviewChange;
}

function review(overrides: Partial<SourceReview> = {}): SourceReview {
  return {
    syncId: "11111111-1111-4111-8111-111111111111",
    sourceVersionId: 7,
    generatedAt: new Date().toISOString(),
    conflicts: [],
    incoming: [],
    overrides: [],
    firstRead: [],
    resolved: [],
    ...overrides,
  };
}

function renderPanel(
  props: Partial<Parameters<typeof CatalogueChangesPanel>[0]>,
) {
  return render(
    <CatalogueChangesPanel
      canWrite
      hasEverSynced
      isPublished
      kindLabel="course"
      path="/admin/courses/2027/comp2700"
      recordId={12}
      review={null}
      unpublished={[]}
      {...props}
    />,
  );
}

test("a record that has never been synced says so", () => {
  renderPanel({ hasEverSynced: false });
  expect(screen.getByText("No ANU changes yet")).toBeTruthy();
  expect(
    screen.getByText("This course hasn't been synced from ANU."),
  ).toBeTruthy();
  expect(screen.queryByText("Conflicts")).toBeNull();
});

test("local draft work is named when ANU has nothing waiting", () => {
  renderPanel({
    unpublished: [
      {
        fieldPath: "course.details.description",
        oldValue: "Old",
        newValue: "New",
        summary: "Description: Old → New",
        sourceLocator: null,
        sourceExcerpt: null,
      },
    ],
  });
  expect(screen.getByText("No incoming ANU changes")).toBeTruthy();
  expect(screen.getByText("You have 1 unpublished draft change.")).toBeTruthy();
  expect(screen.getByText("Unpublished changes")).toBeTruthy();
});

test("a matching record offers nothing to review", () => {
  renderPanel({});
  expect(screen.getByText("No changes to review")).toBeTruthy();
  expect(
    screen.getByText("This course matches the latest ANU information."),
  ).toBeTruthy();
});

test("a conflict shows all three values and both decisions", () => {
  renderPanel({
    review: review({
      conflicts: [
        change({
          classification: "conflict",
          localValue: "Locally authored",
        }),
      ],
    }),
  });
  expect(screen.getByText("Conflicts")).toBeTruthy();
  expect(screen.getByText("Previous ANU")).toBeTruthy();
  expect(screen.getByText("Current")).toBeTruthy();
  expect(screen.getByText("New ANU")).toBeTruthy();
  expect(screen.getByText("Manually changed")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep current" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Use ANU" })).toBeTruthy();
});

test("an ordinary source change applies the one path it names", async () => {
  actions.resolve.mockResolvedValue({
    ok: true,
    message: "Description now matches ANU.",
  });
  renderPanel({ review: review({ incoming: [change()] }) });
  expect(screen.getByText("Incoming from ANU")).toBeTruthy();
  expect(screen.queryByText("Previous ANU")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Use ANU" }));
  expect(actions.resolve).toHaveBeenCalledWith({
    recordId: 12,
    changeId: 1,
    decision: "use_source",
    path: "/admin/courses/2027/comp2700",
  });
});

test("kept values stay available without nagging", () => {
  renderPanel({
    review: review({
      overrides: [
        change({ classification: "local_override", localValue: "Ours" }),
      ],
    }),
  });
  const disclosure = screen
    .getByText("Kept different from ANU")
    .closest("details");
  expect(disclosure?.open).toBe(false);
  expect(
    screen.getByRole("button", { name: "Use ANU after all" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Keep current" })).toBeNull();
});

test("what the model flagged leads the tab, least certain field first", () => {
  renderPanel({
    review: review({ incoming: [change()] }),
    notes: summariseReviewNotes({
      flags: [
        {
          fieldPath: "requisites.prerequisiteRule",
          severity: "error",
          code: "INVALID",
          message: "The rule named a course code ANU does not use.",
        },
        {
          fieldPath: "requirements.rule.children.3",
          severity: "warning",
          code: "AMBIGUOUS",
          message: "Kept as the page's wording.",
        },
      ],
      evidence: [
        { fieldPath: "fees", confidence: 0.9, excerpt: "$5520" },
        { fieldPath: "offerings", confidence: 0.55, excerpt: "First Semester" },
        { fieldPath: "college", confidence: 0.7, excerpt: "ANU College" },
      ],
    }),
  });
  expect(
    screen.getByRole("heading", { name: "What to check" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("1 part could not be read and was left empty"),
  ).toBeInTheDocument();
  expect(screen.getByText("Prerequisite rule:")).toBeInTheDocument();
  expect(screen.getByText("Requirements, branch 4:")).toBeInTheDocument();
  const uncertain = screen
    .getAllByText(/% sure$/u)
    .map((node) => node.textContent);
  // Fees are sure enough not to be listed.
  expect(uncertain).toEqual(["55% sure", "70% sure"]);
});

test("nothing flagged means no notes section", () => {
  renderPanel({
    review: review({ incoming: [change()] }),
    notes: summariseReviewNotes({ flags: [], evidence: [] }),
  });
  expect(
    screen.queryByRole("heading", { name: "What to check" }),
  ).not.toBeInTheDocument();
});

test("a first reading leads with what needs review and folds what was read plainly", () => {
  renderPanel({
    review: review({
      firstRead: [
        change({
          id: 21,
          classification: "first_read",
          label: "Prerequisite rule",
          fieldPath: "requirements.prerequisite",
          unitKind: "requirement_rule",
          confidence: 0.42,
          band: "needs_review",
          reason: "One sentence was split into several conditions",
        }),
        change({
          id: 22,
          classification: "first_read",
          confidence: 0.8,
          band: "check",
          reason: "Probably right, worth a look",
        }),
        change({
          id: 23,
          classification: "first_read",
          label: "Title",
          confidence: 0.97,
          band: "accepted",
          reason: "Stated plainly on the page",
        }),
      ],
    }),
  });
  expect(screen.getByText("First reading from ANU")).toBeTruthy();
  expect(
    screen.getByText(/1 part needs review before this can be published/u),
  ).toBeTruthy();
  expect(screen.getByText("42% sure")).toBeTruthy();
  expect(
    screen.getByText("One sentence was split into several conditions"),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Approve all 1" })).toBeTruthy();
  expect(screen.getByText("Stated plainly")).toBeTruthy();
  expect(screen.queryByText("No changes to review")).toBeNull();
});

test("leaves out first readings taken word for word from the page", () => {
  renderPanel({
    review: review({
      firstRead: [
        change({
          id: 31,
          classification: "first_read",
          label: "Title",
          confidence: 1,
          band: "accepted",
          reason: "Stated plainly on the page",
        }),
      ],
    }),
  });
  expect(screen.queryByText("First reading from ANU")).toBeNull();
  expect(screen.getByText("No changes to review")).toBeTruthy();
});
