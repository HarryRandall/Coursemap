import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/rooms/directions/route";

const state = vi.hoisted(() => ({
  load: vi.fn(),
  fullLoad: vi.fn(),
  read: vi.fn(),
  claim: vi.fn(),
  write: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/rooms/campus-map-data", () => ({
  loadCampusRoutePlaces: state.load,
  loadCampusMapData: state.fullLoad,
}));
vi.mock("@/lib/rooms/route-cache", () => ({
  createRoomRouteCache: () => ({
    read: state.read,
    claim: state.claim,
    write: state.write,
  }),
}));

const places = [
  { id: "a", slug: "copland", coordinates: [149.12, -35.28], isRoutable: true },
  { id: "b", slug: "library", coordinates: [149.13, -35.29], isRoutable: true },
];
const route = {
  coordinates: [
    [149.12, -35.28],
    [149.13, -35.29],
  ],
  distanceMetres: 100,
  durationSeconds: 80,
};
const upstream = {
  routes: [
    {
      geometry: { coordinates: route.coordinates },
      distance: 100,
      duration: 80,
    },
  ],
};
function request(signal?: AbortSignal) {
  return new Request(
    "https://coursemap.app/api/rooms/directions?from=copland&to=library",
    { signal },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", state.fetch);
  vi.stubEnv("ROOM_MAP_ROUTING_URL", "https://routing.example.test/foot");
  state.load.mockResolvedValue({ places, error: null });
  state.fullLoad.mockResolvedValue({ data: { places }, error: null });
  state.read.mockResolvedValue(null);
  state.claim.mockResolvedValue(true);
  state.write.mockResolvedValue(undefined);
  state.fetch.mockResolvedValue(Response.json(upstream));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("loads just the two endpoint slugs and persists a successful route", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(route);
  expect(state.load).toHaveBeenCalledWith(["copland", "library"]);
  expect(state.fullLoad).not.toHaveBeenCalled();
  expect(state.write).toHaveBeenCalledWith(expect.any(String), route);
  expect(state.fetch.mock.calls[0][1].cache).toBe("no-store");
});

test("serves a cached route without claiming or calling the provider", async () => {
  state.read.mockResolvedValue(route);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(route);
  expect(state.claim).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(state.write).not.toHaveBeenCalled();
});

test("returns 429 with Retry-After when the shared provider slot is occupied", async () => {
  state.claim.mockResolvedValue(false);
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("1");
  expect(state.fetch).not.toHaveBeenCalled();
});

test.each(["read", "claim"] as const)(
  "fails closed when the database %s fails",
  async (operation) => {
    state[operation].mockRejectedValue(new Error("database unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(state.fetch).not.toHaveBeenCalled();
  },
);

test("bounds the provider request to five seconds and returns a clean 504", async () => {
  const timeout = new AbortController();
  const timeoutSpy = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(timeout.signal);
  state.fetch.mockImplementation((_url: URL, options: RequestInit) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason),
        { once: true },
      );
      timeout.abort(
        new DOMException("private provider detail", "TimeoutError"),
      );
    });
  });
  const response = await GET(request());
  expect(timeoutSpy).toHaveBeenCalledWith(5000);
  expect(response.status).toBe(504);
  expect(await response.json()).toEqual({
    error: "Walking directions are temporarily unavailable.",
  });
  expect(state.write).not.toHaveBeenCalled();
});

test("cancels the upstream fetch when the caller disconnects", async () => {
  const caller = new AbortController();
  state.fetch.mockImplementation(
    (_url: URL, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        expect(options.signal).toBeInstanceOf(AbortSignal);
        options.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
        caller.abort();
      }),
  );
  expect((await GET(request(caller.signal))).status).toBe(502);
  expect(state.fetch.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(state.write).not.toHaveBeenCalled();
});

test.each([
  () => Promise.reject(new Error("provider detail")),
  () => Promise.resolve(new Response("failed", { status: 500 })),
  () => Promise.resolve(Response.json({ routes: [] })),
  () => Promise.resolve(new Response("invalid json")),
])(
  "returns a clean 502 without caching a failed provider response",
  async (response) => {
    state.fetch.mockImplementation(response);
    const result = await GET(request());
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({
      error: "Walking directions are temporarily unavailable.",
    });
    expect(state.write).not.toHaveBeenCalled();
  },
);

test("does not report success if persisting the route fails", async () => {
  state.write.mockRejectedValue(new Error("database detail"));
  expect((await GET(request())).status).toBe(502);
});

test("separates reversed pairs, moved endpoints and providers in the cache", async () => {
  await GET(request());
  const originalKey = state.read.mock.calls[0][0];
  await GET(
    new Request(
      "https://coursemap.app/api/rooms/directions?from=library&to=copland",
    ),
  );
  state.load.mockResolvedValue({
    places: [{ ...places[0], coordinates: [149.14, -35.28] }, places[1]],
    error: null,
  });
  await GET(request());
  vi.stubEnv("ROOM_MAP_ROUTING_URL", "https://other.example.test/foot");
  await GET(request());
  expect(new Set(state.read.mock.calls.map(([key]) => key)).size).toBe(4);
  expect(JSON.parse(originalKey)).toEqual([
    "a",
    "b",
    expect.stringContaining("149.12,-35.28;149.13,-35.29"),
  ]);
});

test.each([
  "from=copland&to=copland",
  "from=../bad&to=library",
  "from=copland",
])("rejects invalid endpoints: %s", async (query) => {
  expect(
    (
      await GET(
        new Request(`https://coursemap.app/api/rooms/directions?${query}`),
      )
    ).status,
  ).toBe(400);
  expect(state.load).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
});

test("preserves unavailable and non-routable place responses", async () => {
  state.load.mockResolvedValue({
    places: [{ ...places[0], isRoutable: false }, places[1]],
    error: null,
  });
  state.fullLoad.mockResolvedValue({
    data: { places: [{ ...places[0], isRoutable: false }, places[1]] },
    error: null,
  });
  expect((await GET(request())).status).toBe(404);
  state.load.mockResolvedValue({
    places: [],
    error: "Room Finder data could not be loaded.",
  });
  state.fullLoad.mockResolvedValue({
    data: { places: [] },
    error: "Room Finder data could not be loaded.",
  });
  expect((await GET(request())).status).toBe(503);
  expect(state.fetch).not.toHaveBeenCalled();
});
