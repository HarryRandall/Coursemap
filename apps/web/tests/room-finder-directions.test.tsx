import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RoomFinder } from "@/ui/rooms/room-finder";
import type { CampusMapData, CampusMapPlace } from "@/lib/rooms/campus-map";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/ui/rooms/campus-map", () => ({ CampusMap: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/rooms",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function place(slug: string): CampusMapPlace {
  return {
    id: slug,
    slug,
    layerId: "buildings",
    name: slug,
    markerLabel: slug,
    address: "ANU",
    coordinates: [149.12, -35.28],
    officialUrl: null,
    dataStatus: "mapped",
    mapDisplayKind: "building",
    isRoutable: true,
    searchTerms: [],
    sortOrder: 0,
    details: [],
  };
}
const data: CampusMapData = {
  campus: null,
  layers: [],
  places: [place("copland"), place("library")],
  features: [],
  rooms: [],
  indoorMaps: [],
};
const route = {
  coordinates: [
    [149.12, -35.28],
    [149.13, -35.29],
  ],
  distanceMetres: 100,
  durationSeconds: 80,
};
const busyMessage = "Walking directions are busy. Try again in a moment.";
function busy(retryAfter: string | null = "1") {
  return Response.json(
    { error: busyMessage },
    {
      status: 429,
      headers: retryAfter === null ? {} : { "Retry-After": retryAfter },
    },
  );
}
function finder() {
  return render(
    <RoomFinder
      data={data}
      initialFromSlug="copland"
      initialToSlug="library"
    />,
  );
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
function directions() {
  return within(screen.getByRole("region", { name: "Walking directions" }));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  state.fetch.mockReset();
  vi.stubGlobal("fetch", state.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("recovers from 429 without changing endpoints and honours Retry-After seconds", async () => {
  state.fetch
    .mockResolvedValueOnce(busy("2"))
    .mockResolvedValueOnce(Response.json(route));
  finder();
  await advance(250);
  expect(directions().getByText("Finding a walking route...")).toBeVisible();
  expect(directions().queryByText(busyMessage)).not.toBeInTheDocument();
  await advance(1999);
  expect(state.fetch).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(state.fetch).toHaveBeenCalledTimes(2);
  expect(state.fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/rooms/directions?from=copland&to=library",
    "/api/rooms/directions?from=copland&to=library",
  ]);
  expect(directions().getByText(/100 m/)).toBeVisible();
});

test("honours an HTTP-date Retry-After value", async () => {
  state.fetch
    .mockResolvedValueOnce(busy("Sat, 10 Oct 2026 00:00:03 GMT"))
    .mockResolvedValueOnce(Response.json(route));
  finder();
  await advance(250);
  await advance(2749);
  expect(state.fetch).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(state.fetch).toHaveBeenCalledTimes(2);
  expect(directions().getByText(/100 m/)).toBeVisible();
});

test.each([null, "invalid", "0", "-1"])(
  "waits at least one second when Retry-After is %s",
  async (header) => {
    state.fetch
      .mockResolvedValueOnce(busy(header))
      .mockResolvedValueOnce(Response.json(route));
    finder();
    await advance(250);
    await advance(999);
    expect(state.fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(state.fetch).toHaveBeenCalledTimes(2);
  },
);

test("stops after three automatic retries and shows the busy error", async () => {
  state.fetch.mockImplementation(() => Promise.resolve(busy()));
  finder();
  await advance(250);
  await advance(3000);
  expect(state.fetch).toHaveBeenCalledTimes(4);
  expect(directions().getByText(busyMessage)).toBeVisible();
  await advance(60_000);
  expect(state.fetch).toHaveBeenCalledTimes(4);
});

test("limits total retry waiting to thirty seconds without shortening Retry-After", async () => {
  state.fetch.mockImplementation(() => Promise.resolve(busy("15")));
  finder();
  await advance(250);
  await advance(30_000);
  expect(state.fetch).toHaveBeenCalledTimes(3);
  expect(directions().getByText(busyMessage)).toBeVisible();
  await advance(60_000);
  expect(state.fetch).toHaveBeenCalledTimes(3);
});

test.each(["120", "9".repeat(400)])(
  "does not retry early when Retry-After exceeds the wait budget: %s",
  async (header) => {
    state.fetch.mockResolvedValue(busy(header));
    finder();
    await advance(250);
    expect(directions().getByText(busyMessage)).toBeVisible();
    await advance(120_000);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  },
);

test("cancels a waiting retry when the endpoints change", async () => {
  state.fetch
    .mockResolvedValueOnce(busy("2"))
    .mockResolvedValueOnce(Response.json(route));
  finder();
  await advance(250);
  const oldSignal: AbortSignal = state.fetch.mock.calls[0][1].signal;
  expect(directions().getByText("Finding a walking route...")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Swap start and destination" }),
  );
  expect(oldSignal.aborted).toBe(true);
  await advance(250);
  expect(state.fetch.mock.calls[1][0]).toBe(
    "/api/rooms/directions?from=library&to=copland",
  );
  await advance(3000);
  expect(state.fetch).toHaveBeenCalledTimes(2);
  expect(directions().getByText(/100 m/)).toBeVisible();
});

test("cancels a waiting retry on unmount", async () => {
  state.fetch.mockResolvedValueOnce(busy());
  const view = finder();
  await advance(250);
  const signal: AbortSignal = state.fetch.mock.calls[0][1].signal;
  expect(directions().getByText("Finding a walking route...")).toBeVisible();
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await advance(3000);
  expect(state.fetch).toHaveBeenCalledTimes(1);
});

test("does not apply a late response from the previous endpoints", async () => {
  let resolveOldResponse: (response: Response) => void = () => {
    throw new Error("The first request has not started.");
  };
  state.fetch
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOldResponse = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ error: "No route for these places." }, { status: 404 }),
    );
  finder();
  await advance(250);
  const oldSignal: AbortSignal = state.fetch.mock.calls[0][1].signal;
  fireEvent.click(
    screen.getByRole("button", { name: "Swap start and destination" }),
  );
  expect(oldSignal.aborted).toBe(true);
  await advance(250);
  await act(async () => {
    resolveOldResponse(Response.json(route));
  });
  expect(directions().getByText("No route for these places.")).toBeVisible();
  expect(directions().queryByText(/100 m/)).not.toBeInTheDocument();
});

test.each([404, 502])("keeps HTTP %s failures terminal", async (status) => {
  state.fetch.mockResolvedValue(
    Response.json({ error: "No walking route." }, { status }),
  );
  finder();
  await advance(250);
  expect(directions().getByText("No walking route.")).toBeVisible();
  await advance(60_000);
  expect(state.fetch).toHaveBeenCalledTimes(1);
});

test("does not retry invalid route responses", async () => {
  state.fetch.mockResolvedValue(Response.json({ coordinates: [] }));
  finder();
  await advance(250);
  expect(
    directions().getByText("Walking directions could not be loaded."),
  ).toBeVisible();
  await advance(60_000);
  expect(state.fetch).toHaveBeenCalledTimes(1);
});

test("aborts an in-flight retry on unmount and ignores its late 429 response", async () => {
  let resolveRetry: (response: Response) => void = () => {
    throw new Error("The retry has not started.");
  };
  state.fetch.mockResolvedValueOnce(busy()).mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveRetry = resolve;
      }),
  );
  const view = finder();
  await advance(250);
  await advance(1000);
  expect(state.fetch).toHaveBeenCalledTimes(2);
  const signal: AbortSignal = state.fetch.mock.calls[1][1].signal;
  expect(signal.aborted).toBe(false);
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolveRetry(busy());
  });
  expect(vi.getTimerCount()).toBe(0);
  await advance(3000);
  expect(state.fetch).toHaveBeenCalledTimes(2);
});

test("ignores a route body that finishes decoding after the endpoints change", async () => {
  let resolveBody: (body: unknown) => void = () => {
    throw new Error("The first response has not arrived.");
  };
  const oldResponse = Response.json(route);
  vi.spyOn(oldResponse, "json").mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveBody = resolve;
      }),
  );
  state.fetch
    .mockResolvedValueOnce(oldResponse)
    .mockResolvedValueOnce(
      Response.json({ error: "No route for these places." }, { status: 404 }),
    );
  finder();
  await advance(250);
  fireEvent.click(
    screen.getByRole("button", { name: "Swap start and destination" }),
  );
  await advance(250);
  await act(async () => {
    resolveBody(route);
  });
  expect(directions().getByText("No route for these places.")).toBeVisible();
  expect(directions().queryByText(/100 m/)).not.toBeInTheDocument();
});
