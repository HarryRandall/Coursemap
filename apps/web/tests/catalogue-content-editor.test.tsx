import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";

import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { CatalogueEditorProvider } from "@/ui/admin/catalogue/catalogue-editor-context";
import { RecordActions } from "@/ui/admin/catalogue/record-actions";
import { CatalogueContentEditor } from "@/ui/admin/catalogue/content-editor";

const actions = vi.hoisted(() => ({
  begin: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("@/lib/coursemap/admin-catalogue-actions", () => ({
  beginCatalogueDraftAction: actions.begin,
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

function renderEditor({ hasDraft = true } = {}) {
  return render(
    <TooltipProvider delayDuration={0}>
      <CatalogueEditorProvider
        initial={initialContent()}
        recordId={42}
        initialRevision={0}
        initiallyPublished
        initialHasDraft={hasDraft}
        initialHasUnpublishedChanges={hasDraft}
        path="/admin/courses/2026/comp1000"
      >
        <RecordActions canWrite sync={null} />
        <CatalogueContentEditor />
      </CatalogueEditorProvider>
    </TooltipProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  actions.begin.mockReset();
  actions.begin.mockResolvedValue({ ok: true, revision: 0 });
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

test("editing opens the draft actions, with nothing yet to publish", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1, unchanged: false });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderEditor({ hasDraft: false });
  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));

  await user.click(screen.getByRole("button", { name: "Record actions" }));
  expect(
    screen.getByRole("menuitem", { name: "Discard draft" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Publish" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{Escape}");

  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Worth keeping" },
  });
  await act(async () => vi.advanceTimersByTime(1_000));

  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await waitFor(() =>
    expect(
      screen.getByRole("menuitem", { name: "Publish" }),
    ).not.toHaveAttribute("aria-disabled"),
  );
});

test("discarding a draft leaves the record with nothing to discard", async () => {
  actions.discard.mockResolvedValue({ ok: true, message: "Draft discarded." });
  renderEditor();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Discard draft" }));
  await user.click(
    await screen.findByRole("button", { name: "Discard draft" }),
  );
  await waitFor(() => expect(actions.discard).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "Record actions" }));
  expect(
    screen.queryByRole("menuitem", { name: "Discard draft" }),
  ).not.toBeInTheDocument();
});

test("a record without a draft is read until editing is asked for", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderEditor({ hasDraft: false });

  expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  // The values are still there to read, just not to change.
  expect(screen.getByText("Test course")).toBeInTheDocument();
  expect(actions.begin).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Test course");
  // Asking to edit is what opens the draft, so the record is still a draft
  // when whoever opened it comes back to the page later.
  expect(actions.begin).toHaveBeenCalledWith(
    expect.objectContaining({ recordId: 42 }),
  );
  expect(actions.save).not.toHaveBeenCalled();
});

test("backing out of an opened draft discards it, keeping no checkpoint", async () => {
  actions.discard.mockResolvedValue({ ok: true, message: "Draft discarded." });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderEditor({ hasDraft: false });
  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));

  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Discard draft" }));
  expect(
    screen.getByText(
      "The editor goes back to the published version. Nothing has been changed in it, so nothing is kept.",
    ),
  ).toBeInTheDocument();
  await user.click(
    await screen.findByRole("button", { name: "Discard draft" }),
  );

  await waitFor(() => expect(actions.discard).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "Record actions" }));
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument(),
  );
  expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
});
