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

import { requirementWriteWithTree } from "@/lib/catalogue-import/requirement-tree";
import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { CatalogueEditorProvider } from "@/ui/admin/catalogue/catalogue-editor-context";
import { RecordActions } from "@/ui/admin/catalogue/record-actions";
import { RecordTabs, RecordTabList } from "@/ui/admin/catalogue/record-tabs";
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
      >
        <RecordActions canWrite />
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
  expect(screen.getByRole("status")).toHaveTextContent("Saving...");
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

test("server autosave refresh preserves later typing and expanded sections", async () => {
  let finish!: (value: unknown) => void;
  actions.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  actions.save.mockResolvedValue({ ok: true, revision: 2, unchanged: false });
  const initial = initialContent();
  const editor = (content: typeof initial, revision: number) => (
    <TooltipProvider delayDuration={0}>
      <CatalogueEditorProvider
        initial={content}
        recordId={42}
        initialRevision={revision}
        initiallyPublished
        initialHasDraft
        initialHasUnpublishedChanges
      >
        <RecordActions canWrite />
        <RecordTabs value="content" path="/admin/courses/2026/comp1000">
          <RecordTabList />
        </RecordTabs>
        <CatalogueContentEditor />
      </CatalogueEditorProvider>
    </TooltipProvider>
  );
  const view = render(editor(initial, 0));
  fireEvent.click(screen.getByRole("button", { name: "Tags0" }));
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "First edit" },
  });
  expect(screen.getByRole("tab", { name: "Student view" })).toBeDisabled();
  await act(async () => vi.advanceTimersByTime(1_000));
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Second edit during saving" },
  });
  const server = structuredClone(initial);
  server.course!.details.description = "First edit";
  view.rerender(editor(server, 1));
  await act(async () => {
    finish({ ok: true, revision: 1, unchanged: false });
  });
  expect(screen.getByLabelText("Description")).toHaveValue(
    "Second edit during saving",
  );
  expect(screen.getByRole("button", { name: "Tags0" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await act(async () => vi.advanceTimersByTime(1_000));
  await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(2));
  expect(actions.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedRevision: 1,
      content: expect.objectContaining({
        course: expect.objectContaining({
          details: expect.objectContaining({
            description: "Second edit during saving",
          }),
        }),
      }),
    }),
  );
  expect(screen.getByRole("tab", { name: "Student view" })).toBeEnabled();
});

test("a clean editor adopts a reviewed server draft without remounting its sections", () => {
  const initial = initialContent();
  const editor = (content: typeof initial, revision: number) => (
    <CatalogueEditorProvider
      initial={content}
      recordId={42}
      initialRevision={revision}
      initiallyPublished
      initialHasDraft
      initialHasUnpublishedChanges
    >
      <CatalogueContentEditor />
    </CatalogueEditorProvider>
  );
  const view = render(editor(initial, 0));
  fireEvent.click(screen.getByRole("button", { name: "Tags0" }));
  const reviewed = structuredClone(initial);
  reviewed.course!.details.description = "Reviewed wording";
  view.rerender(editor(reviewed, 1));
  expect(screen.getByLabelText("Description")).toHaveValue("Reviewed wording");
  expect(screen.getByRole("button", { name: "Tags0" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("editing recorded source wording preserves unsupported condition kinds and unit scopes", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1, unchanged: false });
  const initial = initialContent();
  initial.requirements = requirementWriteWithTree(
    initial.requirements,
    "prerequisite",
    {
      type: "group",
      id: "root",
      operator: "all_of",
      minimumCount: null,
      children: [
        {
          type: "condition",
          id: "major",
          kind: "course",
          courseCode: "ECON1101",
        },
      ],
    },
    "Complete a major.",
  );
  const condition = initial.requirements.conditions[0]!;
  condition.kind = "structure_set";
  condition.itemCode = null;
  condition.itemKind = null;
  condition.structureKind = "major";
  condition.scope = "degree";
  condition.maximumUnits = 48;
  initial.requirements.options = [
    {
      conditionKey: condition.key,
      position: 1,
      kind: "major",
      code: "ACMK-MAJ",
      title: null,
      sourceText: null,
    },
  ];
  render(
    <CatalogueEditorProvider
      initial={initial}
      recordId={42}
      initialRevision={0}
      initiallyPublished
      initialHasDraft
      initialHasUnpublishedChanges
    >
      <CatalogueContentEditor />
    </CatalogueEditorProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Prerequisites1" }));
  fireEvent.change(screen.getByLabelText("Source wording shown to students"), {
    target: { value: "Complete one approved major." },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1));
  const expected = structuredClone(initial.requirements);
  expected.rules[0]!.sourceText = "Complete one approved major.";
  expect(actions.save.mock.calls[0]![0].content.requirements).toEqual(expected);
});

test("a new unit option retains its numeric type after an empty field is filled", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1, unchanged: false });
  renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "Unit options0" }));
  fireEvent.click(screen.getByRole("button", { name: "Add item" }));
  const inputs = screen.getAllByRole("spinbutton", { name: "Units" });
  fireEvent.change(inputs[1]!, { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Label"), {
    target: { value: "Six-unit placement" },
  });
  fireEvent.change(screen.getByLabelText("Source Text"), {
    target: { value: "6 units for 120 hours of placement." },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1));
  expect(
    actions.save.mock.calls[0]![0].content.course.unitOptions[0],
  ).toMatchObject({
    units: 6,
    label: "Six-unit placement",
    sourceText: "6 units for 120 hours of placement.",
  });
});

test("recorded JSON waits for Apply and merges with later ordinary edits", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1, unchanged: false });
  const initial = emptyCatalogueContent({
    kind: "programme",
    code: "BSTAT",
    academicYear: 2027,
  });
  initial.requirements = requirementWriteWithTree(
    initial.requirements,
    "structure",
    {
      type: "group",
      id: "root",
      operator: "all_of",
      minimumCount: null,
      children: [
        {
          type: "condition",
          id: "major",
          kind: "structure",
          structureCode: "PRST-MAJ",
        },
      ],
    },
    "Complete a major.",
  );
  const condition = initial.requirements.conditions[0]!;
  condition.kind = "structure_set";
  condition.structureKind = "major";
  initial.requirements.options = [
    {
      conditionKey: condition.key,
      position: 0,
      kind: "major",
      code: "PRST-MAJ",
      title: null,
      sourceText: null,
    },
  ];
  render(
    <CatalogueEditorProvider
      initial={initial}
      recordId={42}
      initialRevision={0}
      initiallyPublished
      initialHasDraft
      initialHasUnpublishedChanges
    >
      <CatalogueContentEditor />
    </CatalogueEditorProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Requirements1" }));
  const input = screen.getByLabelText("Recorded rule JSON");
  const corrected = String((input as HTMLTextAreaElement).value).replaceAll(
    "PRST-MAJ",
    "PSTO-MAJ",
  );
  fireEvent.change(input, { target: { value: "{" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply corrected rule" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter valid JSON");
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(actions.save).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: corrected } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A later ordinary edit" },
  });
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(actions.save).toHaveBeenCalledTimes(1);
  expect(
    actions.save.mock.calls[0]![0].content.requirements.options[0].code,
  ).toBe("PRST-MAJ");
  expect(input).toHaveValue(corrected);
  fireEvent.click(screen.getByRole("button", { name: "Apply corrected rule" }));
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(actions.save).toHaveBeenCalledTimes(2);
  const saved = actions.save.mock.calls[1]![0].content;
  expect(saved.requirements.options[0].code).toBe("PSTO-MAJ");
  expect(saved.structure.details.description).toBe("A later ordinary edit");
  expect(saved.requirements.rules).toEqual(initial.requirements.rules);
});

test("supported text rules keep the visual editor and offer recorded editing on request", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1, unchanged: false });
  const initial = initialContent();
  initial.requirements = requirementWriteWithTree(
    initial.requirements,
    "prerequisite",
    {
      type: "group",
      id: "root",
      operator: "all_of",
      minimumCount: null,
      children: [
        {
          type: "condition",
          id: "text",
          kind: "other",
          freeText: "Complete the published alternative branches.",
        },
      ],
    },
    "Complete the published alternative branches.",
  );
  render(
    <CatalogueEditorProvider
      initial={initial}
      recordId={42}
      initialRevision={0}
      initiallyPublished
      initialHasDraft
      initialHasUnpublishedChanges
    >
      <CatalogueContentEditor />
    </CatalogueEditorProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Prerequisites1" }));
  expect(screen.queryByLabelText("Recorded rule JSON")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit recorded rule" }));
  const input = screen.getByLabelText("Recorded rule JSON");
  const submitted = JSON.parse((input as HTMLTextAreaElement).value);
  submitted.conditions[0].kind = "tagged_units";
  submitted.conditions[0].tag = "transdisciplinary_problem_solving";
  submitted.conditions[0].minimumUnits = 12;
  fireEvent.change(input, { target: { value: JSON.stringify(submitted) } });
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(actions.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply corrected rule" }));
  await act(async () => vi.advanceTimersByTime(1_000));
  expect(actions.save).toHaveBeenCalledTimes(1);
  expect(
    actions.save.mock.calls[0]![0].content.requirements.conditions[0],
  ).toMatchObject({
    kind: "tagged_units",
    tag: "transdisciplinary_problem_solving",
    minimumUnits: 12,
  });
});
