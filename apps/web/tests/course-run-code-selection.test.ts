import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({
  canManageCatalogueOperations: async () => true,
  canWriteCourses: async () => true,
  canWriteCatalogue: async () => true,
  getAuthViewer: async () => ({ id: "administrator" }),
}));
vi.mock("@/lib/admin/settings", () => ({
  loadImportModelSetting: async () => ({
    model: "test-model",
    models: [{ id: "test-model" }],
  }),
}));
vi.mock("@/lib/catalogue-runs/adapter", () => ({
  bulkImportAdapter: () => ({
    parserVersion: "test-parser",
    promptVersion: "test-prompt",
    schemaVersion: "test-schema",
  }),
}));
vi.mock("@/lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: async (run: (sql: unknown) => unknown) => {
    const sql = Object.assign(mocks.query, {
      array: (codes: string[]) => codes,
      begin: (transaction: (tx: unknown) => unknown) => transaction(sql),
    });
    return run(sql);
  },
}));

import { parseCourseRunOptions } from "@/lib/catalogue-runs/options";
import {
  createCourseRun,
  previewCourseRun,
} from "@/lib/catalogue-runs/service";

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("select records.id, codes.code"))
      return [{ id: 11, code: "STAT1008", available_count: 1 }];
    if (query.includes("insert into public.catalogue_course_runs"))
      return [{ id: "selected-run" }];
    if (query.includes("insert into public.catalogue_syncs"))
      return [{ id: "selected-sync" }];
    return [];
  });
});

test("preview restricts selection inside the counted and limited eligible-record query", async () => {
  const preview = await previewCourseRun(
    parseCourseRunOptions({
      year: 2027,
      codes: ["stat1008"],
      limit: 20,
      allowAi: false,
    }),
  );
  const [strings, ...parameters] = mocks.query.mock.calls[0]!;
  const query = (strings as TemplateStringsArray).join("?");
  expect(query).toContain("count(*) over() as available_count");
  expect(query).toContain("codes.code = any(?::text[])");
  expect(query.indexOf("codes.code = any")).toBeLessThan(
    query.indexOf("order by codes.code limit"),
  );
  expect(parameters).toEqual(["course", 2027, false, ["STAT1008"], 20]);
  expect(preview).toMatchObject({
    count: 1,
    availableCount: 1,
    records: [{ id: 11, code: "STAT1008" }],
    estimateKind: "not_used",
  });
});

test("creation re-previews the exact code filter and queues only its selected records", async () => {
  await expect(
    createCourseRun(
      parseCourseRunOptions({
        year: 2027,
        codes: ["STAT1008"],
        allowAi: false,
      }),
    ),
  ).resolves.toEqual({ runId: "selected-run" });
  expect(mocks.query.mock.calls[0]!.slice(1)).toEqual([
    "course",
    2027,
    false,
    ["STAT1008"],
    100,
  ]);
  const syncs = mocks.query.mock.calls.filter(([strings]) =>
    (strings as TemplateStringsArray)
      .join("?")
      .includes("insert into public.catalogue_syncs"),
  );
  expect(syncs).toHaveLength(1);
  expect(syncs[0]!.slice(1)).toContain(11);
  const run = mocks.query.mock.calls.find(([strings]) =>
    (strings as TemplateStringsArray)
      .join("?")
      .includes("insert into public.catalogue_course_runs"),
  )!;
  expect(run.slice(1).slice(-2)).toEqual([false, false]);
});

test("a blank optional filter keeps the existing all-missing selection", async () => {
  await previewCourseRun(parseCourseRunOptions({ year: 2027, allowAi: false }));
  expect(mocks.query.mock.calls[0]!.slice(1)).toEqual([
    "course",
    2027,
    true,
    [],
    100,
  ]);
});
