import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: mocks.permission,
}));
vi.mock("@/lib/catalogue-sync/sync-queue", () => ({
  processCatalogueSyncInline: vi.fn(),
}));
vi.mock("@/lib/catalogue-sync/sync-service", () => ({
  startCatalogueSync: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: mocks.from }),
}));
import { GET } from "@/app/api/admin/catalogue-syncs/route";
const syncId = "10000000-0000-4000-8000-000000000001";
function request(id = syncId) {
  return new Request(`http://localhost/api/admin/catalogue-syncs?syncId=${id}`);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockResolvedValue(true);
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.single });
  mocks.single.mockResolvedValue({
    data: { id: syncId, status: "running", error_message: null },
    error: null,
  });
});
test("returns only one sync's status behind the catalogue permission gate", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    sync: { id: syncId, status: "running", errorMessage: null },
  });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("catalogue_syncs");
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith(
    "id,status,error_message",
  );
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("id", syncId);
});
test("denies unauthorised and invalid status reads without querying syncs", async () => {
  mocks.permission.mockResolvedValue(false);
  expect((await GET(request())).status).toBe(403);
  mocks.permission.mockResolvedValue(true);
  expect((await GET(request("invalid"))).status).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
});
test("reports missing rows and query failures", async () => {
  mocks.single.mockResolvedValue({ data: null, error: null });
  expect((await GET(request())).status).toBe(404);
  mocks.single.mockResolvedValue({
    data: null,
    error: { message: "private error" },
  });
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "The sync status could not be loaded.",
  });
});
