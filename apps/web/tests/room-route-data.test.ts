import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadCampusRoutePlaces } from "@/lib/rooms/campus-map-data";
import { createRoomRouteCache } from "@/lib/rooms/route-cache";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ from: state.from }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: state.createClient }));
const route = {
  coordinates: [
    [149.12, -35.28],
    [149.13, -35.29],
  ] as [number, number][],
  distanceMetres: 100,
  durationSeconds: 80,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-test-key");
  const client = { from: state.from, rpc: state.rpc };
  state.createClient.mockReturnValue(client);
  const query = {
    select: state.select,
    in: state.in,
    eq: state.eq,
    gt: state.gt,
    maybeSingle: state.maybeSingle,
    upsert: state.upsert,
  };
  state.from.mockReturnValue(query);
  state.select.mockReturnValue(query);
  state.eq.mockReturnValue(query);
  state.gt.mockReturnValue(query);
  state.in.mockResolvedValue({ data: [], error: null });
  state.maybeSingle.mockResolvedValue({ data: null, error: null });
  state.rpc.mockResolvedValue({ data: true, error: null });
  state.upsert.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("reads only routing columns for the requested published slugs", async () => {
  state.in.mockResolvedValue({
    data: [
      {
        id: "a",
        slug: "copland",
        longitude: 149.12,
        latitude: -35.28,
        is_routable: true,
      },
    ],
    error: null,
  });
  expect(await loadCampusRoutePlaces(["copland", "library"])).toEqual({
    places: [
      {
        id: "a",
        slug: "copland",
        coordinates: [149.12, -35.28],
        isRoutable: true,
      },
    ],
    error: null,
  });
  expect(state.from).toHaveBeenCalledExactlyOnceWith("campus_map_places");
  expect(state.select).toHaveBeenCalledExactlyOnceWith(
    "id,slug,longitude,latitude,is_routable",
  );
  expect(state.in).toHaveBeenCalledExactlyOnceWith("slug", [
    "copland",
    "library",
  ]);
  expect(state.createClient).not.toHaveBeenCalled();
});

test("reports endpoint query failures without leaking database details", async () => {
  state.in.mockResolvedValue({
    data: null,
    error: new Error("private database detail"),
  });
  expect(await loadCampusRoutePlaces(["copland", "library"])).toEqual({
    places: [],
    error: "Room Finder data could not be loaded.",
  });
});

test("uses a cookie-free server credential and excludes routes older than an hour", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
  state.maybeSingle.mockResolvedValue({
    data: {
      coordinates: route.coordinates,
      distance_metres: 100,
      duration_seconds: 80,
    },
    error: null,
  });
  expect(await createRoomRouteCache().read("pair")).toEqual(route);
  expect(state.createClient).toHaveBeenCalledWith(
    "http://127.0.0.1:54321",
    "server-test-key",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  expect(state.eq).toHaveBeenCalledWith("route_key", "pair");
  expect(state.gt).toHaveBeenCalledWith(
    "cached_at",
    "2026-10-09T23:00:00.000Z",
  );
});

test("requires the server key before making cache requests", () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect(() => createRoomRouteCache()).toThrow(
    "Room Finder routing is not configured.",
  );
  expect(state.createClient).not.toHaveBeenCalled();
});

test("ignores malformed cached geometry", async () => {
  state.maybeSingle.mockResolvedValue({
    data: { coordinates: [], distance_metres: 100, duration_seconds: 80 },
    error: null,
  });
  expect(await createRoomRouteCache().read("pair")).toBeNull();
});

test("uses the atomic database function for every claim", async () => {
  const cache = createRoomRouteCache();
  expect(await cache.claim()).toBe(true);
  state.rpc.mockResolvedValue({ data: false, error: null });
  expect(await cache.claim()).toBe(false);
  expect(state.rpc).toHaveBeenCalledWith("claim_room_route_request");
});

test("writes successful routes under their pair key", async () => {
  await createRoomRouteCache().write("pair", route);
  expect(state.upsert).toHaveBeenCalledWith({
    route_key: "pair",
    coordinates: route.coordinates,
    distance_metres: 100,
    duration_seconds: 80,
    cached_at: expect.any(String),
  });
});

test("propagates cache and throttle database errors", async () => {
  const cache = createRoomRouteCache();
  const error = new Error("database unavailable");
  state.maybeSingle.mockResolvedValue({ data: null, error });
  state.rpc.mockResolvedValue({ data: null, error });
  state.upsert.mockResolvedValue({ error });
  await expect(cache.read("pair")).rejects.toThrow(error);
  await expect(cache.claim()).rejects.toThrow(error);
  await expect(cache.write("pair", route)).rejects.toThrow(error);
});
