import { beforeEach, expect, it, vi } from "vitest";
import { syntheticSeltReport } from "./fixtures/selt/report";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: (callback: (sql: unknown) => unknown) => callback({}),
}));
vi.mock("../lib/selt/store", () => ({
  SeltAuthenticationError: class extends Error {},
  withSeltToken: mocks.authenticate,
  importSeltReport: mocks.upload,
}));
import { POST } from "../app/api/selt/import/route";
import { SeltAuthenticationError } from "../lib/selt/store";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue(true);
  mocks.upload.mockResolvedValue({ outcome: "imported" });
});
function request(body: unknown, token = "a".repeat(43)) {
  return new Request("http://localhost/api/selt/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
it("refuses unauthenticated uploads before parsing the report", async () => {
  expect((await POST(request({}, "invalid"))).status).toBe(401);
  expect(mocks.authenticate).not.toHaveBeenCalled();
  mocks.authenticate.mockRejectedValue(new SeltAuthenticationError());
  expect((await POST(request(syntheticSeltReport()))).status).toBe(401);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("rejects invalid and oversized uploads without storing them", async () => {
  expect((await POST(request({}))).status).toBe(400);
  expect((await POST(request("x".repeat(256 * 1024)))).status).toBe(400);
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("uploads validated records and never includes private storage errors", async () => {
  expect((await POST(request(syntheticSeltReport()))).status).toBe(200);
  mocks.upload.mockRejectedValue(
    new Error("private database connection detail"),
  );
  const response = await POST(request(syntheticSeltReport()));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private database");
});
