import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  administrator: vi.fn(),
  readRuns: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: async () => true,
}));
vi.mock("@/lib/catalogue-runs/service", () => ({
  requireCourseRunAdministrator: mocks.administrator,
  parseCourseRunOptions: ({ year }: { year: number }) => ({ year }),
  readCourseRuns: mocks.readRuns,
}));
vi.mock("@/lib/catalogue-sync/sync-queue", () => ({
  syncQueueEnabled: () => true,
  dispatchCatalogueSync: vi.fn(),
  processCatalogueSyncInline: vi.fn(),
}));

import { POST as recoverProvider } from "@/app/api/admin/catalogue-provider/route";
import { DELETE as stopSync } from "@/app/api/admin/catalogue-syncs/route";
import { GET as readImportRuns } from "@/app/api/admin/course-import-runs/route";
import { removePlanCourse, setCourseStar } from "@/lib/coursemap/actions";

const PRIVATE = 'relation "private.user_roles" does not exist';
const ORIGIN = "http://127.0.0.1:4319";

function mutation(method: string, body: unknown) {
  return new Request(`${ORIGIN}/api/admin/test`, {
    method,
    headers: { Origin: ORIGIN },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "42P01", message: PRIVATE },
  });
  mocks.administrator.mockResolvedValue({ id: "admin" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("admin routes replace database messages with fixed copy", async () => {
  for (const response of [
    await stopSync(mutation("DELETE", { syncId: "sync" })),
    await recoverProvider(mutation("POST", { revision: 1, resume: true })),
  ]) {
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(PRIVATE);
  }
  expect(console.error).toHaveBeenCalledWith(
    "The sync could not be stopped.",
    expect.objectContaining({ message: PRIVATE }),
  );
});

test("a known SQLSTATE keeps its specific recovery copy", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "40001", message: "raw" },
  });
  const response = await recoverProvider(
    mutation("POST", { revision: 1, resume: true }),
  );
  expect(await response.json()).toEqual({
    error: "The provider state changed. Refresh before resuming.",
  });
});

test("import run reads distinguish permission, validation and server failures", async () => {
  const read = (query: string) =>
    readImportRuns(
      new Request(`${ORIGIN}/api/admin/course-import-runs?${query}`),
    );

  mocks.readRuns.mockRejectedValue(
    Object.assign(new Error(PRIVATE), { code: "42P01" }),
  );
  const failed = await read("year=2026");
  expect(failed.status).toBe(500);
  expect(JSON.stringify(await failed.json())).not.toContain(PRIVATE);

  const invalid = await read("year=2026&summary=not-a-run");
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: "Choose a valid import run." });

  mocks.administrator.mockRejectedValue(new Error("denied"));
  expect((await read("year=2026")).status).toBe(403);
});

test("planning actions keep authored messages and hide the rest", async () => {
  expect((await setCourseStar("COMP1100", true)).message).toBe(
    "Couldn't save that change. Try again.",
  );
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "P0002", message: "Your primary plan was not found." },
  });
  expect((await setCourseStar("COMP1100", true)).message).toBe(
    "Your primary plan was not found.",
  );
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "P0002", message: PRIVATE },
  });
  expect((await removePlanCourse("item")).message).not.toContain(PRIVATE);
});
