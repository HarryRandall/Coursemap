import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), administrator: vi.fn() }));
vi.mock("../lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: (callback: (sql: unknown) => unknown) => callback({}),
}));
vi.mock("../lib/catalogue-runs/service", () => ({
  requireCourseRunAdministrator: mocks.administrator,
}));
vi.mock("../lib/auth/viewer", () => ({ canWriteCourses: vi.fn() }));
vi.mock("../lib/selt/store", () => ({
  createSeltRun: mocks.create,
  publishSeltReport: vi.fn(),
}));
import { POST } from "../app/api/admin/selt/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:4319");
  mocks.administrator.mockResolvedValue({ id: "test" });
  mocks.create.mockResolvedValue({ token: "test-token" });
});
afterEach(() => vi.unstubAllEnvs());
function request(origin: string) {
  return new Request("http://localhost:4319/api/admin/selt", {
    method: "POST",
    headers: {
      Origin: origin,
      "x-forwarded-host": "127.0.0.1:4319",
      "x-forwarded-proto": "http",
    },
    body: JSON.stringify({ action: "create" }),
  });
}
it("accepts the validated application origin behind the local Next.js proxy", async () => {
  expect((await POST(request("http://127.0.0.1:4319"))).status).toBe(200);
  expect(mocks.create).toHaveBeenCalledOnce();
});
it("rejects cross-origin cookie-authenticated token creation", async () => {
  expect((await POST(request("https://other.example"))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
