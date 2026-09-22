import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { CatalogueSyncButton } from "@/ui/admin/catalogue/sync-button";

const { refresh, success, failure } = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success, error: failure } }));

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
  success.mockReset();
  failure.mockReset();
});

test("starts one record-level ANU sync", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ syncId: "sync-1", mode: "inline" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  render(<CatalogueSyncButton recordId={42} kind="course" latestSync={null} />);

  fireEvent.click(screen.getByRole("button", { name: "Sync from ANU" }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    recordId: 42,
    kind: "course",
  });
  expect(await screen.findByRole("button")).toBeDisabled();
  expect(screen.getByRole("button")).toHaveTextContent("Syncing from ANU...");
});

test("offers a retry after a failed sync", () => {
  render(
    <CatalogueSyncButton
      recordId={42}
      kind="course"
      latestSync={{
        id: "sync-1",
        status: "failed",
        trigger: "manual",
        requestedAt: "2026-09-22T00:00:00Z",
        checkedAt: null,
        completedAt: "2026-09-22T00:01:00Z",
        previousSourceVersionId: null,
        sourceVersionId: null,
        errorCode: "SOURCE_FETCH_FAILED",
        errorMessage: "ANU did not respond.",
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Retry sync" })).toBeEnabled();
});
