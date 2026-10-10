import type { Page, Route } from "@playwright/test";
import { beforeEach, expect, test, vi } from "vitest";
import { stubRoomMapRequests } from "../playwright/room-map-stubs";
import { localTestEnvironment } from "../scripts/local/test-environment.mjs";
import { createRoomRoutingStub } from "../scripts/local/room-routing-stub.mjs";
import {
  buildWalkingRouteUrl,
  parseWalkingRouteResponse,
} from "@/lib/rooms/routing";

const state = vi.hoisted(() => ({ status: vi.fn(), beforeEach: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: state.status }));
vi.mock("../playwright/fixtures", () => ({
  test: Object.assign(vi.fn(), { beforeEach: state.beforeEach }),
  expect,
  login: vi.fn(),
}));
beforeEach(() => {
  state.status.mockReturnValue({
    status: 0,
    stdout: JSON.stringify({
      API_URL: "http://127.0.0.1:54321",
      DB_URL: "postgresql://postgres:test@127.0.0.1:54322/postgres",
      ANON_KEY: "test-public",
      SERVICE_ROLE_KEY: "test-server",
    }),
  });
});

test("always replaces the routing provider in the local browser environment", () => {
  const env = localTestEnvironment();
  expect(env.ROOM_MAP_ROUTING_URL).toBe(
    "http://127.0.0.1:4320/routed-foot/route/v1/driving",
  );
  expect(new URL(env.ROOM_MAP_ROUTING_URL).hostname).toBe("127.0.0.1");
});

test("allows the local routing stub while retaining HTTPS for remote providers", () => {
  const place = { coordinates: [149.12, -35.28] as [number, number] };
  expect(
    buildWalkingRouteUrl(place, place, "http://127.0.0.1:4320/foot").origin,
  ).toBe("http://127.0.0.1:4320");
  for (const url of [
    "http://routing.example.test/foot",
    "http://127.0.0.1.example.test/foot",
    "ftp://127.0.0.1/foot",
  ]) {
    expect(() => buildWalkingRouteUrl(place, place, url)).toThrow(
      "must use HTTPS",
    );
  }
});

test("intercepts both tile hosts without allowing provider requests through", async () => {
  const registrations = new Map<string, (route: Route) => Promise<void>>();
  const page = {
    route: vi.fn(
      async (pattern: string, handler: (route: Route) => Promise<void>) => {
        registrations.set(pattern, handler);
      },
    ),
  };
  await stubRoomMapRequests(page as unknown as Page);
  expect([...registrations.keys()]).toEqual([
    "https://tiles.openfreemap.org/**",
    "https://tiles.mapterhorn.com/**",
  ]);
  for (const [pattern, path] of [
    [
      "https://tiles.openfreemap.org/**",
      "https://tiles.openfreemap.org/styles/liberty",
    ],
    [
      "https://tiles.mapterhorn.com/**",
      "https://tiles.mapterhorn.com/tilejson.json",
    ],
  ]) {
    const fulfill = vi.fn();
    const abort = vi.fn();
    const route = { request: () => ({ url: () => path }), fulfill, abort };
    await registrations.get(pattern)?.(route as unknown as Route);
    expect(fulfill).toHaveBeenCalledOnce();
    expect(abort).not.toHaveBeenCalled();
    if (path.includes("openfreemap")) {
      expect(fulfill.mock.calls[0][0].json).toMatchObject({
        version: 8,
        sources: {},
      });
    } else {
      expect(fulfill.mock.calls[0][0].json.tiles).toEqual([
        "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
      ]);
    }
    await registrations.get(pattern)?.({
      ...route,
      request: () => ({ url: () => `${new URL(path).origin}/0/0/0.webp` }),
    } as unknown as Route);
    expect(abort).toHaveBeenCalledOnce();
  }
});

test("the local stub returns a usable route without calling a provider", () => {
  const server = createRoomRoutingStub();
  const response = { writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
  server.emit(
    "request",
    {
      url: "/routed-foot/route/v1/driving/149.12,-35.28;149.13,-35.29?overview=full",
    },
    response,
  );
  expect(response.writeHead).toHaveBeenCalledWith(200, {
    "Content-Type": "application/json",
  });
  expect(
    parseWalkingRouteResponse(JSON.parse(response.end.mock.calls[0][0])),
  ).toEqual({
    coordinates: [
      [149.12, -35.28],
      [149.13, -35.29],
    ],
    distanceMetres: 100,
    durationSeconds: 80,
  });
});

test("the local stub supplies readiness and rejects invalid endpoints", () => {
  const server = createRoomRoutingStub();
  const health = { writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
  server.emit("request", { url: "/health" }, health);
  expect(health.writeHead).toHaveBeenCalledWith(200);
  const invalid = { writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
  server.emit("request", { url: "/route/invalid" }, invalid);
  expect(invalid.writeHead).toHaveBeenCalledWith(400);
});

test("installs tile interception before every rendered-page journey", async () => {
  await import("../playwright/rendered.spec");
  expect(state.beforeEach).toHaveBeenCalledOnce();
  const page = { route: vi.fn() };
  await state.beforeEach.mock.calls[0][0]({ page });
  expect(page.route.mock.calls.map(([pattern]) => pattern)).toEqual([
    "https://tiles.openfreemap.org/**",
    "https://tiles.mapterhorn.com/**",
  ]);
});

test("starts the routing stub with the authenticated Playwright server", async () => {
  const { default: config } = await import("../playwright.config");
  expect(config.webServer).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        command: "node scripts/local/room-routing-stub.mjs",
        url: "http://127.0.0.1:4320/health",
        reuseExistingServer: false,
      }),
      expect.objectContaining({
        env: expect.objectContaining({
          ROOM_MAP_ROUTING_URL:
            "http://127.0.0.1:4320/routed-foot/route/v1/driving",
        }),
      }),
    ]),
  );
});
