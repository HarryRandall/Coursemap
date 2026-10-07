import { beforeEach, expect, test, vi } from "vitest";
import { sweepCatalogueSyncs } from "@/lib/catalogue-sync/sync-sweeper";
import { GET } from "@/app/api/cron/catalogue-syncs/route";

const mocks = vi.hoisted(() => ({
  failExpired: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/lib/catalogue-sync/sync-store", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withSyncDatabaseClient: (work: (sql: unknown) => unknown) => work(mocks.sql),
  failExhaustedExpiredSyncs: mocks.failExpired,
}));

const SYNC_ID = "10000000-0000-4000-8000-000000000001";

function sweepRows(runs: string[], syncs: Record<string, unknown>[]) {
  mocks.sql.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join("").includes("from public.catalogue_course_runs")
      ? runs.map((id) => ({ id }))
      : syncs,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.failExpired.mockResolvedValue(["expired"]);
  sweepRows(["run"], [{ id: SYNC_ID, dispatch_generation: 2 }]);
});

test("a sync whose dispatch never completed is sent again under its generation", async () => {
  const dispatch = vi.fn(async () => ({ mode: "queue" as const }));
  const advance = vi.fn(async () => null);
  expect(
    await sweepCatalogueSyncs({ dispatch, advance, queueEnabled: true }),
  ).toEqual({ failedExpired: 1, redispatched: 1, advancedRuns: 1, errors: [] });
  expect(mocks.failExpired).toHaveBeenCalledWith(mocks.sql, "all");
  expect(dispatch).toHaveBeenCalledWith({ syncId: SYNC_ID, generation: 2 });
});

test("a run whose worker stopped before advancing it is advanced by the sweep", async () => {
  sweepRows(["stalled", "unavailable"], []);
  const advance = vi
    .fn()
    .mockResolvedValueOnce({ syncId: SYNC_ID, mode: "queue" })
    .mockRejectedValueOnce(new Error("Run unavailable."));
  expect(
    await sweepCatalogueSyncs({
      dispatch: vi.fn(),
      advance,
      queueEnabled: true,
    }),
  ).toEqual({
    failedExpired: 1,
    redispatched: 0,
    advancedRuns: 1,
    errors: ["Run unavailable."],
  });
  expect(advance.mock.calls).toEqual([["stalled"], ["unavailable"]]);
});

test("a failed redispatch is reported without stopping the sweep", async () => {
  sweepRows(
    [],
    [
      { id: SYNC_ID, dispatch_generation: 0 },
      { id: "second", dispatch_generation: 0 },
    ],
  );
  const dispatch = vi
    .fn()
    .mockRejectedValueOnce(new Error("Queue unavailable."))
    .mockResolvedValueOnce({ mode: "queue" });
  expect(
    await sweepCatalogueSyncs({
      dispatch,
      advance: vi.fn(),
      queueEnabled: true,
    }),
  ).toEqual({
    failedExpired: 1,
    redispatched: 1,
    advancedRuns: 0,
    errors: ["Queue unavailable."],
  });
});

test("inline mode only fails exhausted syncs", async () => {
  const dispatch = vi.fn();
  const advance = vi.fn();
  expect(
    await sweepCatalogueSyncs({ dispatch, advance, queueEnabled: false }),
  ).toEqual({ failedExpired: 1, redispatched: 0, advancedRuns: 0, errors: [] });
  expect(mocks.sql).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(advance).not.toHaveBeenCalled();
});

test.each([
  ["no secret is configured", "", "Bearer "],
  ["the header is missing", "cron-secret", null],
  ["the secret is wrong", "cron-secret", "Bearer other-secret"],
])("the sweep refuses a request when %s", async (_case, secret, header) => {
  vi.stubEnv("CRON_SECRET", secret);
  const response = await GET(
    new Request("http://localhost/api/cron/catalogue-syncs", {
      headers: header === null ? {} : { authorization: header },
    }),
  );
  expect(response.status).toBe(401);
  expect(mocks.failExpired).not.toHaveBeenCalled();
});

test("the sweep runs for Vercel Cron's bearer secret", async () => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("COURSEMAP_QUEUE_SYNCS_ENABLED", "false");
  const response = await GET(
    new Request("http://localhost/api/cron/catalogue-syncs", {
      headers: { authorization: "Bearer cron-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    failedExpired: 1,
    redispatched: 0,
    advancedRuns: 0,
    errors: [],
  });
});
