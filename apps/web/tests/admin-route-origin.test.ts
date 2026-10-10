import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operations: vi.fn(),
  administrator: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: mocks.operations,
  canWriteCourses: mocks.operations,
}));
vi.mock("@/lib/catalogue-runs/service", () => ({
  requireCourseRunAdministrator: mocks.administrator,
}));

import { POST as directory } from "@/app/api/admin/catalogue-directory/route";
import { POST as provider } from "@/app/api/admin/catalogue-provider/route";
import {
  DELETE as stopSync,
  POST as startSync,
} from "@/app/api/admin/catalogue-syncs/route";
import { POST as importRuns } from "@/app/api/admin/course-import-runs/route";
import { POST as selt } from "@/app/api/admin/selt/route";

const handlers = { directory, provider, startSync, stopSync, importRuns, selt };

function request(method: string, origin?: string) {
  return new Request("http://127.0.0.1:4319/api/admin/test", {
    method,
    headers: origin ? { Origin: origin } : {},
    body: JSON.stringify({}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:4319");
  mocks.operations.mockResolvedValue(true);
  mocks.administrator.mockResolvedValue({ id: "admin" });
});
afterEach(() => vi.unstubAllEnvs());

test.each(Object.entries(handlers))(
  "%s refuses a foreign or missing Origin before any work",
  async (name, handler) => {
    const method = name === "stopSync" ? "DELETE" : "POST";
    for (const origin of ["https://other.example", undefined]) {
      const response = await handler(request(method, origin));
      expect(response.status).toBe(403);
    }
    // SELT checks its permission first; every other route checks Origin first.
    if (name !== "selt") {
      expect(mocks.operations).not.toHaveBeenCalled();
      expect(mocks.administrator).not.toHaveBeenCalled();
    }
  },
);

test("the application's own origin reaches the permission check", async () => {
  mocks.operations.mockResolvedValue(false);
  const response = await provider(request("POST", "http://127.0.0.1:4319"));
  expect(response.status).toBe(403);
  expect(mocks.operations).toHaveBeenCalledOnce();
});

test("a Vercel deployment accepts its own deployment and branch URLs", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://coursemap.example");
  vi.stubEnv("VERCEL_URL", "coursemap-abc123.vercel.app");
  vi.stubEnv("VERCEL_BRANCH_URL", "coursemap-git-fix.vercel.app");
  mocks.operations.mockResolvedValue(false);

  for (const origin of [
    "https://coursemap-abc123.vercel.app",
    "https://coursemap-git-fix.vercel.app",
  ]) {
    await provider(request("POST", origin));
  }
  expect(mocks.operations).toHaveBeenCalledTimes(2);

  mocks.operations.mockClear();
  for (const origin of [
    "http://coursemap-abc123.vercel.app",
    "https://other.vercel.app",
  ]) {
    expect((await provider(request("POST", origin))).status).toBe(403);
  }
  expect(mocks.operations).not.toHaveBeenCalled();
});
