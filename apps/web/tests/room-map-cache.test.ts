import { beforeEach, expect, test, vi } from "vitest";
import { loadCampusMapData } from "@/lib/rooms/campus-map-data";
import { createEmptyCampusIndoorDocument } from "@/lib/rooms/indoor-map";
const mocks = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  factories: [] as { tags: string[] }[],
  publicReads: vi.fn(),
  privateReads: vi.fn(),
  permission: vi.fn(),
  publicRows: new Map<string, unknown[]>(),
  privateRows: new Map<string, unknown[]>(),
  failure: "",
}));
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    keys: string[],
    options: { tags: string[] },
  ) => {
    mocks.factories.push(options);
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (!mocks.cache.has(key)) mocks.cache.set(key, await fn(...args));
      return mocks.cache.get(key);
    };
  },
  updateTag: () => mocks.cache.clear(),
}));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({}) }));
vi.mock("@/lib/auth/viewer", () => ({ canManageRooms: mocks.permission }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ from: (table: string) => query(table, false) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => query(table, true) }),
}));
function query(table: string, privateClient: boolean) {
  let rows =
    (privateClient ? mocks.privateRows : mocks.publicRows).get(table) ?? [];
  const result = () => {
    (privateClient ? mocks.privateReads : mocks.publicReads)(table);
    return {
      data: rows,
      error: mocks.failure === table ? { message: "Unavailable." } : null,
    };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      rows = rows.filter(
        (row) => (row as Record<string, unknown>)[column] === value,
      );
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      rows = rows.filter((row) =>
        values.includes((row as Record<string, unknown>)[column]),
      );
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const value = result();
      return { ...value, data: rows[0] ?? null };
    },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.clear();
  mocks.publicRows.clear();
  mocks.privateRows.clear();
  mocks.failure = "";
  mocks.permission.mockResolvedValue(true);
  mocks.publicRows.set("campus_map_campuses", [
    {
      id: "anu",
      boundary_geojson: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
  ]);
  mocks.publicRows.set("campus_map_layers", [
    { id: "layer", campus_id: "anu" },
  ]);
  mocks.publicRows.set("campus_map_places", [
    { id: "building", layer_id: "layer", slug: "building", name: "Building" },
  ]);
  mocks.publicRows.set("campus_indoor_maps", [
    {
      id: "hidden-draft",
      building_place_id: "building",
      name: "Hidden draft",
      status: "draft",
      document: createEmptyCampusIndoorDocument(),
    },
  ]);
  mocks.privateRows.set("campus_indoor_maps", [
    {
      id: "draft",
      building_place_id: "building",
      name: "Private draft",
      status: "draft",
      document: createEmptyCampusIndoorDocument(),
    },
  ]);
});
test("published maps share a tagged cache across public requests", async () => {
  expect((await loadCampusMapData()).error).toBeNull();
  await loadCampusMapData();
  expect(
    mocks.publicReads.mock.calls.filter(
      ([table]) => table === "campus_map_campuses",
    ),
  ).toHaveLength(1);
  expect(
    mocks.factories.some(({ tags }) => tags.includes("published-campus-map")),
  ).toBe(true);
  expect(mocks.privateReads).not.toHaveBeenCalled();
});
test("manager previews reuse the public base but never share private drafts", async () => {
  const manager = await loadCampusMapData({ includeManageableDrafts: true });
  expect(manager.data.indoorMaps[0]?.name).toBe("Private draft");
  expect(manager.data.indoorMaps).toHaveLength(1);
  const publicMap = await loadCampusMapData();
  expect(publicMap.data.indoorMaps).toEqual([]);
  expect(
    mocks.publicReads.mock.calls.filter(
      ([table]) => table === "campus_map_campuses",
    ),
  ).toHaveLength(1);
  mocks.privateRows.set("campus_indoor_maps", []);
  expect(
    (await loadCampusMapData({ includeManageableDrafts: true })).data
      .indoorMaps,
  ).toEqual([]);
});
test("guests and students without room permission use only the public cache", async () => {
  mocks.permission.mockResolvedValue(false);
  await loadCampusMapData({ includeManageableDrafts: true });
  expect(mocks.privateReads).not.toHaveBeenCalled();
});
test("a failed public read is retried rather than cached as an empty map", async () => {
  mocks.failure = "campus_map_layers";
  expect((await loadCampusMapData()).error).not.toBeNull();
  mocks.failure = "";
  expect((await loadCampusMapData()).error).toBeNull();
  expect(
    mocks.publicReads.mock.calls.filter(
      ([table]) => table === "campus_map_campuses",
    ),
  ).toHaveLength(2);
});

test("manager reads still exclude archived indoor maps", async () => {
  const draft = mocks.privateRows.get("campus_indoor_maps")![0] as Record<
    string,
    unknown
  >;
  mocks.privateRows.set("campus_indoor_maps", [
    draft,
    { ...draft, id: "archived", status: "archived" },
  ]);
  expect(
    (
      await loadCampusMapData({ includeManageableDrafts: true })
    ).data.indoorMaps.map((map) => map.id),
  ).toEqual(["draft"]);
});
