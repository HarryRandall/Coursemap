import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { CatalogueContentEditor } from "@/ui/admin/catalogue/content-editor";

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("@/lib/coursemap/admin-catalogue-actions", () => ({
  saveCatalogueDraftAction: actions.save,
  publishDraftAction: actions.publish,
  unpublishAction: actions.unpublish,
  discardDraftAction: actions.discard,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function initialContent() {
  return emptyCatalogueContent({
    kind: "course",
    code: "COMP1000",
    academicYear: 2026,
    title: "Test course",
  });
}

function renderEditor() {
  return render(
    <CatalogueContentEditor
      initial={initialContent()}
      recordId={42}
      initialRevision={0}
      initiallyPublished
      initialHasUnpublishedChanges={false}
      path="/admin/courses/2026/comp1000"
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  actions.save.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

test("autosave shows saving then saved without a success toast", async () => {
  let resolveSave!: (value: {
    ok: true;
    revision: number;
    unchanged: boolean;
  }) => void;
  actions.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  renderEditor();

  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A clearer description" },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(screen.getByRole("status")).toHaveTextContent("Saving...");
  expect(actions.save).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 0, recordId: 42 }),
  );

  await act(async () => {
    resolveSave({ ok: true, revision: 1, unchanged: false });
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Saved"),
  );
});

test("a stale autosave stops and asks the editor to reload", async () => {
  actions.save.mockResolvedValue({
    ok: false,
    code: "STALE_DRAFT",
    currentRevision: 3,
    error: "This draft changed elsewhere. Reload before applying more changes.",
  });
  renderEditor();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A conflicting description" },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This draft changed elsewhere",
    ),
  );
  expect(screen.getByRole("button", { name: /reload/i })).toBeEnabled();

  await act(async () => vi.advanceTimersByTime(5_000));
  expect(actions.save).toHaveBeenCalledTimes(1);
});

test("a failed autosave preserves the edited value and reports the error", async () => {
  actions.save.mockResolvedValue({
    ok: false,
    code: "INVALID_CONTENT",
    error: "The draft could not be saved.",
  });
  renderEditor();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Keep this text" },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save"),
  );
  expect(screen.getByLabelText("Description")).toHaveValue("Keep this text");
});
