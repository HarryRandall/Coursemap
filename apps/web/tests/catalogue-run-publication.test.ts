import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("../lib/catalogue/drafts.ts", () => ({
  publishCatalogueDraft: mocks.publish,
}));
vi.mock("../lib/catalogue-runs/eligibility.ts", () => ({
  sourceFirstPublicationEligible: (content: { flags: unknown[] }) =>
    content.flags.length === 0,
}));

import {
  publishSavedCourseRunDrafts,
  publishVerifiedRunCandidate,
} from "../lib/catalogue-runs/publication.ts";
import { emptyCatalogueContent } from "../lib/catalogue/content.ts";
import type { SyncSql } from "../lib/catalogue-sync/sync-store.ts";

const COURSE = { kind: "course", academicYear: 2026, code: "COMP1100" };

/** Answers each query in turn and records the text of every statement. */
function fakeSql(results: unknown[][]) {
  const statements: string[] = [];
  const sql = (strings: TemplateStringsArray) => {
    statements.push(strings.join("?"));
    return Promise.resolve(results.shift() ?? []);
  };
  sql.begin = async (work: (tx: typeof sql) => Promise<unknown>) => work(sql);
  return { sql: sql as unknown as SyncSql, statements };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publish.mockResolvedValue({ versionId: 7, record: COURSE });
});

test("a cache failure after publication does not pause the run", async () => {
  mocks.revalidateTag.mockImplementation(() => {
    throw new Error("Cache unavailable");
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { sql, statements } = fakeSql([
    [{ id: "run-id", requested_by: "user-id", record_id: 1, revision: 0 }],
  ]);

  const result = await publishVerifiedRunCandidate(
    sql,
    "sync-id",
    emptyCatalogueContent({
      kind: "course",
      code: "COMP1100",
      academicYear: 2026,
      title: "Programming as Problem Solving",
    }),
  );

  expect(result).toEqual({ versionId: 7, record: COURSE });
  expect(statements.some((statement) => statement.includes("paused"))).toBe(
    false,
  );
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test("saved drafts whose content is not a catalogue aggregate are held, not fatal", async () => {
  const valid = emptyCatalogueContent({
    kind: "course",
    code: "COMP1100",
    academicYear: 2026,
    title: "Programming as Problem Solving",
  });
  const { sql } = fakeSql([
    [],
    [{ allowed: true }],
    [
      { record_id: 1, revision: 0, content: { kind: "major" } },
      { record_id: 2, revision: 0, content: valid },
    ],
  ]);

  const result = await publishSavedCourseRunDrafts(sql, "run-id", "user-id");

  expect(result).toMatchObject({ published: 1, held: 1 });
  expect(mocks.publish).toHaveBeenCalledOnce();
  expect(mocks.publish).toHaveBeenCalledWith(
    expect.objectContaining({ recordId: 2 }),
  );
});
