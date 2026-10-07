import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  administrator: vi.fn(),
  readRuns: vi.fn(),
  previewRun: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: async () => true,
  getAuthViewer: async () => ({ id: "admin", email: null }),
}));
vi.mock("@/lib/admin/settings", () => ({
  loadImportModelSetting: async () => ({ model: "test/model" }),
}));
vi.mock("@/lib/catalogue-sync/process-sync", () => ({
  safeErrorSummary: (error: Error) => error.message,
  syncAdapterForKind: () => ({
    parserVersion: "p",
    promptVersion: "p",
    schemaVersion: "s",
  }),
}));
vi.mock("@/lib/catalogue-runs/service", () => ({
  requireCourseRunAdministrator: mocks.administrator,
  parseCourseRunOptions: ({ year }: { year: number }) => ({ year }),
  readCourseRuns: mocks.readRuns,
  previewCourseRun: mocks.previewRun,
}));
vi.mock("@/lib/catalogue-sync/sync-queue", () => ({
  syncQueueEnabled: () => true,
  dispatchCatalogueSync: mocks.dispatch,
  processCatalogueSyncInline: vi.fn(),
}));

import { POST as recoverProvider } from "@/app/api/admin/catalogue-provider/route";
import {
  DELETE as stopSync,
  POST as startSync,
} from "@/app/api/admin/catalogue-syncs/route";
import {
  GET as readImportRuns,
  POST as importRunAction,
} from "@/app/api/admin/course-import-runs/route";
import { UserFacingError } from "@/lib/public-errors";
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
    error: { code: "42P01", message: PRIVATE },
  });
  expect((await removePlanCourse("item")).message).not.toContain(PRIVATE);
});

test.each([
  ["P0002", "COMP1100 for 2027 isn't imported yet."],
  ["P0002", "The selected major is not published for that academic year."],
  ["22023", "The selected minor is not an explicit option for that programme."],
  [
    "40001",
    "A selected academic structure changed while the plan was being saved. Please try again.",
  ],
])(
  "planning messages built with format() reach the student (%s)",
  async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });
    expect((await setCourseStar("COMP1100", true)).message).toBe(message);
    // The templates are recognised even when the SQLSTATE is lost.
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    expect((await setCourseStar("COMP1100", true)).message).toBe(message);
  },
);

test("permission errors never pass their database text through", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: 'permission denied for table "plans"' },
  });
  expect((await setCourseStar("COMP1100", true)).message).toBe(
    "Couldn't save that change. Try again.",
  );
});

test("import run actions keep service copy and hide database failures", async () => {
  mocks.previewRun.mockRejectedValue(
    new UserFacingError("Choose an enabled import model first."),
  );
  const refused = await importRunAction(
    mutation("POST", { action: "preview" }),
  );
  expect(refused.status).toBe(400);
  expect(await refused.json()).toEqual({
    error: "Choose an enabled import model first.",
  });

  mocks.previewRun.mockRejectedValue(
    Object.assign(new Error(PRIVATE), { code: "42P01" }),
  );
  const failed = await importRunAction(mutation("POST", { action: "preview" }));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "The import action failed." });
});

test("starting a sync keeps its refusals and hides database failures", async () => {
  const start = () =>
    startSync(mutation("POST", { recordId: 1, kind: "course" }));

  mocks.rpc.mockResolvedValue({
    data: null,
    error: {
      code: "55000",
      message: "This record already has an unfinished ANU sync.",
    },
  });
  const refused = await start();
  expect(refused.status).toBe(400);
  expect(await refused.json()).toEqual({
    error: "This record already has an unfinished ANU sync.",
  });

  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "42P01", message: PRIVATE },
  });
  const hidden = await start();
  expect(JSON.stringify(await hidden.json())).not.toContain(PRIVATE);

  mocks.rpc.mockResolvedValue({ data: "sync-id", error: null });
  mocks.dispatch.mockRejectedValue(new Error(PRIVATE));
  const failed = await start();
  expect(failed.status).toBe(500);
  expect(JSON.stringify(await failed.json())).not.toContain(PRIVATE);
});
