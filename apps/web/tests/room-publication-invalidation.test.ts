import { beforeEach, expect, test, vi } from "vitest";
import { saveCampusIndoorMap } from "@/lib/rooms/indoor-map-admin";
import { createEmptyCampusIndoorDocument } from "@/lib/rooms/indoor-map";
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  conflict: false,
  permission: true,
}));
vi.mock("next/cache", () => ({
  updateTag: mocks.update,
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/viewer", () => ({
  canManageRooms: async () => mocks.permission,
}));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: () => ({}) }));
const buildingId = "00000000-0000-4000-8000-000000000001";
vi.mock("@/lib/rooms/campus-map-data", () => ({
  loadCampusMapData: async () => ({
    error: null,
    data: {
      places: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          mapDisplayKind: "building",
        },
      ],
      features: [
        {
          featureKind: "building",
          placeId: "00000000-0000-4000-8000-000000000001",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [149.12, -35.28],
                [149.121, -35.28],
                [149.121, -35.281],
                [149.12, -35.28],
              ],
            ],
          },
        },
      ],
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      let saving = false;
      const query = {
        select: () => query,
        eq: () => query,
        update: () => {
          saving = true;
          return query;
        },
        maybeSingle: async () => ({
          data: saving
            ? mocks.conflict
              ? null
              : { revision: 2 }
            : { id: "map", revision: 1 },
          error: null,
        }),
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.conflict = false;
  mocks.permission = true;
});
test.each(["published", "draft"] as const)(
  "saving a %s expires the public map, including publication removal",
  async (status) => {
    const result = await saveCampusIndoorMap({
      buildingPlaceId: buildingId,
      name: "Building",
      document: createEmptyCampusIndoorDocument(),
      revision: 1,
      status,
    });
    expect(result.ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith("published-campus-map");
  },
);
test("a revision conflict does not expire the published map", async () => {
  mocks.conflict = true;
  expect(
    (
      await saveCampusIndoorMap({
        buildingPlaceId: buildingId,
        name: "Building",
        document: createEmptyCampusIndoorDocument(),
        revision: 1,
        status: "published",
      })
    ).ok,
  ).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
});
test("a viewer without room permission cannot invalidate or save the map", async () => {
  mocks.permission = false;
  expect(
    (
      await saveCampusIndoorMap({
        buildingPlaceId: buildingId,
        name: "Building",
        document: createEmptyCampusIndoorDocument(),
        revision: 1,
        status: "published",
      })
    ).ok,
  ).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
});
