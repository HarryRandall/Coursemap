import { beforeEach, expect, it, vi } from "vitest";
import { loadSeltAdminReports } from "../lib/selt/admin";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("../lib/catalogue-sync/sync-store", () => ({
  withSyncDatabaseClient: (callback: (sql: unknown) => unknown) =>
    callback(mocks.sql),
}));

beforeEach(() => mocks.sql.mockReset());

it.each([
  { overall: [75, 75, 75, Number.NaN], expected: [75, 75, 75, null] },
  { overall: [0, 75, null], expected: [0, 75, null] },
  { overall: null, expected: [] },
])(
  "preserves suppressed overall experience values: $overall",
  async ({ overall, expected }) => {
    mocks.sql.mockResolvedValue([
      {
        id: "report-id",
        code: "COMP1100",
        course_name: "Synthetic survey course",
        status: "ready",
        replaces_published: false,
        warnings: [],
        created_at: "2026-10-10T00:00:00Z",
        periods: 4,
        first_year: 2023,
        last_year: 2025,
        overall,
        source_url: "https://example.test/report.pdf",
        total: 1,
      },
    ]);
    const page = await loadSeltAdminReports({
      query: "COMP1100",
      status: null,
      page: 1,
    });
    expect(page.rows[0]!.overall).toEqual(expected);
  },
);
