import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ProviderRecovery } from "@/ui/admin/operations/provider-recovery";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const state = {
  paused: true,
  revision: 1,
  reason: "key_limit",
  message: "Key limit exceeded (total limit).",
  pausedAt: "2026-09-29T00:00:00Z",
  heldCount: 12,
};
const active = { ...state, paused: false, revision: 2 };
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.restoreAllMocks();
  refresh.mockReset();
});

test("resumes once and continues recovering the remaining batches", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      response({ dispatched: 10, state: { ...active, heldCount: 2 } }),
    )
    .mockResolvedValueOnce(
      response({ dispatched: 2, state: { ...active, heldCount: 0 } }),
    );
  render(<ProviderRecovery state={state} />);
  fireEvent.click(screen.getByRole("button", { name: "Resume imports" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(
    request.mock.calls.map((call) => JSON.parse(String(call[1]?.body))),
  ).toEqual([
    { revision: 1, resume: true },
    { revision: 2, resume: false },
  ]);
  expect(screen.queryByText(/could not be resumed|no progress/i)).toBeNull();
});

test("stops when the provider pauses again and reports the new cause", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    response({
      dispatched: 1,
      state: { ...state, revision: 3, message: "Insufficient credits." },
    }),
  );
  render(<ProviderRecovery state={state} />);
  fireEvent.click(screen.getByRole("button", { name: "Resume imports" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Insufficient credits.",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test("stops an interrupted dispatch and offers recovery without another resume", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    response({
      dispatched: 0,
      dispatchError: "Queue unavailable.",
      state: active,
    }),
  );
  render(<ProviderRecovery state={active} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Recover paused imports" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Queue unavailable.",
  );
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    revision: 2,
    resume: false,
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test("prevents a recovery loop when held work makes no progress", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(response({ dispatched: 0, state: active }));
  render(<ProviderRecovery state={active} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Recover paused imports" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Recovery made no progress.",
  );
  expect(request).toHaveBeenCalledTimes(1);
});
