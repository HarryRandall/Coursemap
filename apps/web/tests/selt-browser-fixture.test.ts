import { beforeEach, expect, it, vi } from "vitest";
import "../playwright/fixtures";

type SeltFixture = (
  context: { administrator: { id: string } },
  provide: (fixture: { sql: unknown; sourceHash: string }) => Promise<void>,
) => Promise<void>;

const mocks = vi.hoisted(() => ({
  fixtures: {} as { seltImport?: SeltFixture },
  sql: Object.assign(vi.fn(), { end: vi.fn() }),
}));
vi.mock("@playwright/test", () => ({
  test: {
    extend: (fixtures: typeof mocks.fixtures) => {
      Object.assign(mocks.fixtures, fixtures);
      return {};
    },
  },
  expect: vi.fn(),
}));
vi.mock("postgres", () => ({ default: () => mocks.sql }));
vi.mock("../scripts/local/test-environment.mjs", () => ({
  localTestEnvironment: () => ({
    COURSEMAP_DATABASE_URL: "postgresql://127.0.0.1:1/postgres",
  }),
}));

beforeEach(() => {
  mocks.sql.mockReset().mockResolvedValue([]);
  mocks.sql.end.mockReset().mockResolvedValue(undefined);
});

it.each([false, true])(
  "awaits SELT cleanup before releasing the administrator fixture (failed journey: %s)",
  async (fails) => {
    expect(mocks.fixtures.seltImport).toBeTypeOf("function");
    const failure = new Error("The browser journey timed out.");
    const provide = vi.fn(async (fixture) => {
      expect(fixture.sql).toBe(mocks.sql);
      expect(fixture.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(mocks.sql).not.toHaveBeenCalled();
      if (fails) throw failure;
    });
    const finished = mocks.fixtures.seltImport!(
      { administrator: { id: "fixture-user" } },
      provide,
    );
    if (fails) await expect(finished).rejects.toBe(failure);
    else await finished;

    expect(provide).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls).toHaveLength(2);
    const [reports, runs] = mocks.sql.mock.calls;
    expect(reports![0].join("?")).toContain("delete from public.selt_reports");
    expect(reports![0].join("?")).toContain("requested_by");
    expect(reports!.slice(1)).toEqual(["fixture-user"]);
    expect(runs![0].join("?")).toContain("delete from public.selt_import_runs");
    expect(runs!.slice(1)).toEqual(["fixture-user"]);
    expect(mocks.sql.end).toHaveBeenCalledOnce();
  },
);

it("closes the connection and surfaces a failed cleanup", async () => {
  expect(mocks.fixtures.seltImport).toBeTypeOf("function");
  const failure = new Error("The fixture reports could not be removed.");
  mocks.sql.mockRejectedValueOnce(failure);
  await expect(
    mocks.fixtures.seltImport!(
      { administrator: { id: "fixture-user" } },
      async () => {},
    ),
  ).rejects.toBe(failure);
  expect(mocks.sql).toHaveBeenCalledOnce();
  expect(mocks.sql.end).toHaveBeenCalledOnce();
});

it("keeps teardown pending until reports and tokens have been removed", async () => {
  expect(mocks.fixtures.seltImport).toBeTypeOf("function");
  let removeReports!: (rows: never[]) => void;
  mocks.sql.mockReturnValueOnce(
    new Promise<never[]>((resolve) => {
      removeReports = resolve;
    }),
  );
  const released = vi.fn();
  const finished = mocks.fixtures.seltImport!(
    { administrator: { id: "fixture-user" } },
    async () => {},
  ).then(released);
  await vi.waitFor(() => expect(mocks.sql).toHaveBeenCalledOnce());
  expect(released).not.toHaveBeenCalled();
  expect(mocks.sql.end).not.toHaveBeenCalled();
  removeReports([]);
  await finished;
  expect(mocks.sql).toHaveBeenCalledTimes(2);
  expect(mocks.sql.end).toHaveBeenCalledOnce();
  expect(released).toHaveBeenCalledOnce();
});
