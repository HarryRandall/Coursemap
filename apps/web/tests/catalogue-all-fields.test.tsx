import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { emptyCatalogueContent } from "../lib/catalogue/content";
import { classifyFirstRead } from "../lib/catalogue/first-read";
import { CatalogueEditorProvider } from "../ui/admin/catalogue/catalogue-editor-context";
import { AllFields } from "../ui/admin/catalogue/changes/all-fields";
const actions = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../lib/coursemap/admin-catalogue-actions", () => ({
  saveCatalogueDraftAction: actions.save,
  beginCatalogueDraftAction: vi.fn(),
  approveFirstReadAction: vi.fn(),
  markFieldForReviewAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

it("expands every collection item and edits just the selected field in a saving dialog", async () => {
  actions.save.mockResolvedValue({ ok: true, revision: 1 });
  const content = emptyCatalogueContent({
    kind: "course",
    code: "COMP1000",
    academicYear: 2026,
    title: "Test course",
  });
  content.course!.details.description = "Existing wording";
  content.course!.details.workloadHoursBasis = "weekly";
  content.course!.areasOfInterest = Array.from({ length: 20 }, (_, index) => ({
    position: index + 1,
    name: `Interest ${index + 1}`,
  }));
  const items = classifyFirstRead(content).map((item) => ({
    ...item,
    confidence: item.fieldPath === "course.details.description" ? 0.95 : null,
  }));
  render(
    <TooltipProvider>
      <CatalogueEditorProvider
        initial={content}
        recordId={42}
        initialRevision={0}
        initiallyPublished={false}
        initialHasDraft
        initialHasUnpublishedChanges
      >
        <AllFields items={items} open={{}} recordId={42} canWrite />
      </CatalogueEditorProvider>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  expect(screen.getByText("95%")).toBeInTheDocument();
  expect(screen.queryByText("None given")).not.toBeInTheDocument();
  expect(
    screen.getAllByLabelText("Confidence not provided").length,
  ).toBeGreaterThan(0);
  await user.click(
    screen.getByRole("button", { name: "View all Areas of interest" }),
  );
  expect(screen.getByText("Interest 20")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit Description" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Description");
  expect(
    screen.queryByRole("button", { name: "Overview" }),
  ).not.toBeInTheDocument();
  const field = screen.getByRole("textbox", { name: "Description" });
  await user.clear(field);
  await user.type(field, "Corrected wording");
  await waitFor(() => expect(actions.save).toHaveBeenCalled(), {
    timeout: 2500,
  });
  const saved = actions.save.mock.calls.at(-1)![0].content;
  expect(saved.course.details.description).toBe("Corrected wording");
  expect(saved.course.details.workloadHoursBasis).toBe("weekly");
  expect(saved.course.areasOfInterest).toHaveLength(20);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Edit Description" }),
    ).toHaveFocus(),
  );
});
