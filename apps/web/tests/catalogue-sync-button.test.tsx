import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { CatalogueSyncButton } from "@/ui/admin/catalogue/sync-button";

const { refresh, progress, success, info, failure } = vi.hoisted(() => ({
  refresh: vi.fn(),
  progress: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  failure: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// The running toast is a plain toast rather than a loading one, because sonner
// withholds the close button from loading toasts.
vi.mock("sonner", () => ({
  toast: Object.assign(progress, {
    loading: progress,
    success,
    info,
    error: failure,
  }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
  progress.mockReset();
  success.mockReset();
  info.mockReset();
  failure.mockReset();
});

test("starts one record-level ANU sync", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ syncId: "sync-1", mode: "inline" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
      kind="course"
      latestSync={null}
      hasSynced={false}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync" }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    recordId: 42,
    kind: "course",
  });
  // The progress belongs to the toast, so the button keeps its own label
  // rather than reflowing the header it sits in.
  const button = await screen.findByRole("button");
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent("Sync");
  expect(progress).toHaveBeenCalledWith(
    "Syncing COMP1100",
    expect.objectContaining({ id: "sync:42" }),
  );
});

test("reports a sync that could not start in its own toast", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "Sync permission is required." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
  );
  render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
      kind="course"
      latestSync={null}
      hasSynced={false}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync" }));

  await waitFor(() =>
    expect(failure).toHaveBeenCalledWith(
      "Couldn't start the COMP1100 sync",
      expect.objectContaining({ id: "sync:42" }),
    ),
  );
  // The description is clamped, so the reason it failed is carried whole.
  const [, options] = failure.mock.calls[0] as [
    string,
    { description: { props: { text: string } } },
  ];
  expect(options.description.props.text).toBe("Sync permission is required.");
  expect(screen.getByRole("button")).toBeEnabled();
});

test("hands the toast back when the page that was watching it goes", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ syncId: "sync-1", mode: "inline" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const view = render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
      kind="course"
      latestSync={null}
      hasSynced={false}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync" }));
  await waitFor(() => expect(progress).toHaveBeenCalled());
  view.unmount();

  // Otherwise the toast spins on with nothing left polling to finish it.
  await waitFor(() =>
    expect(info).toHaveBeenCalledWith(
      "Sync still running",
      expect.objectContaining({ id: "sync:42" }),
    ),
  );
});

test("offers a retry after a failed sync", () => {
  render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
      kind="course"
      hasSynced
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
