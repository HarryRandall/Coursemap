import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import type { ReactNode } from "react";
import {
  act,
  renderHook,
  render as renderComponent,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  useCatalogueApproval,
  BulkSectionApproval,
  SectionApproval,
} from "@/ui/admin/imports/catalogue-section-approval";
import { reviewCatalogueSections } from "@/lib/coursemap/catalogue-section-review-actions";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/coursemap/catalogue-section-review-actions", () => ({
  reviewCatalogueSections: vi.fn(),
}));
const render = (children: ReactNode) =>
  renderComponent(<TooltipProvider>{children}</TooltipProvider>);
const section = (key: string, eligible: boolean) => ({
  key,
  eligible,
  approved: false,
  method: null,
  reviewedAt: null,
});

test("verified bulk approval excludes uncertain and prerequisite sections", async () => {
  const onApprove = vi.fn();
  render(
    <BulkSectionApproval
      sections={[
        section("fees", true),
        section("attributes", false),
        section("requisites", false),
      ]}
      disabled={false}
      onApprove={onApprove}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Approve verified (1)" }),
  );
  expect(onApprove).toHaveBeenCalledWith(["fees"], true);
});

test("manual bulk approval remains available when no section is eligible", async () => {
  const onApprove = vi.fn();
  render(
    <BulkSectionApproval
      sections={[section("attributes", false), section("requisites", false)]}
      disabled={false}
      onApprove={onApprove}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Approve remaining (2)" }),
  );
  expect(onApprove).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Approve remaining" }),
  );
  expect(onApprove).toHaveBeenCalledWith(["attributes", "requisites"], false);
});

test("approved sections have an explicit undo action", async () => {
  const onApprove = vi.fn();
  render(
    <SectionApproval
      section={{ ...section("fees", true), approved: true }}
      disabled={false}
      onApprove={onApprove}
    />,
  );
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Undo approval" }));
  expect(onApprove).toHaveBeenCalledWith(false);
});

test("approval is optimistic, waits to enable publication and restores a failed save", async () => {
  let rejectSave!: (error: Error) => void;
  vi.mocked(reviewCatalogueSections).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
  );
  const sections = [section("fees", true)];
  const { result } = renderHook(() =>
    useCatalogueApproval({
      kind: "course",
      yearId: 1,
      snapshotId: 2,
      sections,
    }),
  );
  let saving!: Promise<void>;
  act(() => {
    saving = result.current.approve(["fees"], true);
  });
  expect(result.current.sections[0]?.approved).toBe(true);
  expect(result.current.pending).toBe(true);
  expect(result.current.complete).toBe(false);
  await act(async () => {
    rejectSave(new Error("Could not save"));
    await saving;
  });
  expect(result.current.sections[0]?.approved).toBe(false);
  expect(result.current.pending).toBe(false);
});

test("confirmed approval uses the server result without an extra page refresh", async () => {
  const sections = [section("fees", true)];
  const saved = [{ ...sections[0]!, approved: true, method: "manual" }];
  vi.mocked(reviewCatalogueSections).mockResolvedValueOnce(saved);
  const { result } = renderHook(() =>
    useCatalogueApproval({
      kind: "course",
      yearId: 1,
      snapshotId: 2,
      sections,
    }),
  );
  await act(async () => {
    await result.current.approve(["fees"], true);
  });
  expect(result.current.sections).toEqual(saved);
  expect(result.current.complete).toBe(true);
});
