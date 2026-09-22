import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import type {
  SourceReview,
  SourceReviewChange,
} from "@/lib/catalogue/source-review-store";
import { CatalogueChangesPanel } from "@/ui/admin/catalogue/changes/changes-panel";

const actions = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/lib/coursemap/admin-catalogue-actions", () => ({
  resolveSourceChangeAction: actions.resolve,
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
