import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import { ImportModelPicker } from "../ui/admin/imports/import-model-picker";
const actions = vi.hoisted(() => ({
  setImportModel: vi.fn(),
  saveImportModel: vi.fn(),
  removeImportModel: vi.fn(),
  setImportModelVisibility: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/admin/settings-actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
const models = [
  {
    id: "google/test",
    name: "Gemini Test",
    provider: "Google",
    enabled: true,
    visible: true,
    input_usd_per_million: 0.25,
    output_usd_per_million: 1.5,
    pricing_updated_at: "2026-09-07T00:00:00Z",
  },
  {
    id: "anthropic/test",
    name: "Claude Test",
    provider: "Anthropic",
    enabled: true,
    visible: true,
    input_usd_per_million: 1,
    output_usd_per_million: 5,
    pricing_updated_at: "2026-09-07T00:00:00Z",
  },
];
beforeEach(() => vi.resetAllMocks());
function setup(canManage = true) {
  render(
    <TooltipProvider>
      <ImportModelPicker
        canManage={canManage}
        model="google/test"
        models={models}
        updatedAt={null}
      />
    </TooltipProvider>,
  );
  return userEvent.setup();
}
test("shows compact pricing and selects a model through the workspace menu", async () => {
  actions.setImportModel.mockResolvedValue({ ok: true, message: "Saved." });
  const user = setup();
  expect(screen.getByText("0.55¢")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Import model" }));
  await user.click(
    screen.getByRole("menuitem", { name: "Claude Test, Anthropic" }),
  );
  expect(actions.setImportModel).toHaveBeenCalledWith("anthropic/test");
  expect(actions.refresh).toHaveBeenCalled();
});
test("model management prevents removing the default and preserves failed additions", async () => {
  actions.saveImportModel.mockResolvedValue({
    ok: false,
    message: "The model was not found.",
  });
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Import model" }));
  await user.click(screen.getByRole("menuitem", { name: "Manage models" }));
  await user.click(
    screen.getByRole("button", { name: "Actions for Gemini Test" }),
  );
  expect(
    screen.getByRole("button", { name: "Refresh pricing" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove model" }),
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.type(screen.getByLabelText("OpenRouter model ID"), "test/missing");
  await user.click(screen.getByRole("button", { name: "Add model" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The model was not found.",
  );
  expect(screen.getByLabelText("OpenRouter model ID")).toHaveValue(
    "test/missing",
  );
});
test("read-only viewers cannot change the catalogue", () => {
  setup(false);
  expect(screen.getByRole("button", { name: "Import model" })).toBeDisabled();
});

test("Escape returns focus from model management to its selector", async () => {
  const user = setup();
  const trigger = screen.getByRole("button", { name: "Import model" });
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Manage models" }));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("hides a model from selection while keeping it manageable", async () => {
  actions.setImportModelVisibility.mockResolvedValue({
    ok: true,
    message: "Hidden.",
  });
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Import model" }));
  await user.click(screen.getByRole("menuitem", { name: "Manage models" }));
  await user.click(
    screen.getByRole("button", { name: "Actions for Claude Test" }),
  );
  await user.click(screen.getByRole("button", { name: "Hide model" }));
  expect(actions.setImportModelVisibility).toHaveBeenCalledWith(
    "anthropic/test",
    false,
  );
  expect(actions.refresh).toHaveBeenCalled();
});

test("hidden models can be shown again and are absent from the selector", async () => {
  actions.setImportModelVisibility.mockResolvedValue({
    ok: true,
    message: "Visible.",
  });
  render(
    <TooltipProvider>
      <ImportModelPicker
        canManage
        model="google/test"
        models={models.map((model) => ({
          ...model,
          visible: model.id === "google/test",
        }))}
        updatedAt={null}
      />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Import model" }));
  expect(
    screen.queryByRole("menuitem", { name: "Claude Test, Anthropic" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Manage models" }));
  expect(screen.getByText("Hidden").closest("details")).not.toHaveAttribute(
    "open",
  );
  await user.click(screen.getByText("Hidden"));
  expect(screen.getByText("Hidden").closest("details")).toHaveAttribute("open");
  await user.click(
    screen.getByRole("button", { name: "Actions for Claude Test" }),
  );
  await user.click(screen.getByRole("button", { name: "Show model" }));
  expect(actions.setImportModelVisibility).toHaveBeenCalledWith(
    "anthropic/test",
    true,
  );
});
