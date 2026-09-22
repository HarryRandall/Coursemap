import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { CatalogueSyncButton } from "@/ui/admin/catalogue/sync-button";

const { refresh, loading, success, info, failure } = vi.hoisted(() => ({
  refresh: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  failure: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({
  toast: { loading, success, info, error: failure },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
  loading.mockReset();
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
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync from ANU" }));

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    recordId: 42,
    kind: "course",
  });
  // The progress belongs to the toast, so the button keeps its own label
  // rather than reflowing the header it sits in.
  const button = await screen.findByRole("button");
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent("Sync from ANU");
  expect(loading).toHaveBeenCalledWith(
    "Syncing COMP1100 from ANU",
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
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sync from ANU" }));

  await waitFor(() =>
    expect(failure).toHaveBeenCalledWith(
      "Syncing COMP1100 from ANU could not start",
      expect.objectContaining({ id: "sync:42" }),
    ),
  );
  // The description is clamped to one line, so the reason it failed is carried
  // whole in the tooltip.
  const [, options] = failure.mock.calls[0] as [
    string,
    { description: { props: { title: string } } },
  ];
  expect(options.description.props.title).toBe("Sync permission is required.");
  expect(screen.getByRole("button")).toBeEnabled();
});

test("offers a retry after a failed sync", () => {
  render(
    <CatalogueSyncButton
      recordId={42}
      code="COMP1100"
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
