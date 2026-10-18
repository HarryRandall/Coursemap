import { beforeEach, expect, it, vi } from "vitest";
import { emptyCatalogueContent } from "../lib/catalogue/content";
import { contentHashForCatalogueContent } from "../lib/catalogue-import/version-content";

const { rpc, from, canReadStudentRecords } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  canReadStudentRecords: vi.fn(),
}));
vi.mock("../lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));
vi.mock("../lib/auth/viewer", () => ({ canReadStudentRecords }));
import { loadCatalogueDirectoryPage } from "../lib/coursemap/admin-catalogue";
import { loadAdminDashboard } from "../lib/admin/dashboard";

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  canReadStudentRecords.mockResolvedValue(true);
  from.mockImplementation(() => {
    const query = {
      select: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => query),
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null, count: 0 })),
    };
    return query;
  });
});

function record(code: string) {
  return {
    code,
    title: "Fixture",
    summary: {},
    recordId: 1,
    hasDraft: true,
    draftRevision: 2,
    draftHash: "same",
    publishedHash: "same",
    hasPublication: true,
    isPublished: true,
    isListedByAnu: true,
    lastSeenAt: null,
    sourceState: "up_to_date",
    openChangeCount: 0,
    conflictCount: 0,
    latestSync: null,
  };
}
function page(records: ReturnType<typeof record>[]) {
  return {
    years: [2027, 2026],
    status: { state: "never", refreshedAt: null, message: null, entryCount: 0 },
    total: 1001,
    page: 2,
    records,
  };
}

it("reads only an authorised projected page without full-year table requests", async () => {
  rpc.mockResolvedValue({ data: page([record("COMP1100")]), error: null });
  const result = await loadCatalogueDirectoryPage({
    kind: "course",
    academicYear: 2026,
    query: "human creative",
    state: "published",
    page: 2,
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "admin_catalogue_directory_page",
    {
      p_kind: "course",
      p_academic_year: 2026,
      p_query: "human creative",
      p_state: "published",
      p_page: 2,
    },
  );
  expect(from).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    total: 1001,
    page: 2,
    pageSize: 50,
    records: [{ code: "COMP1100", hasChanges: false }],
  });
  expect(result.records[0]).not.toHaveProperty("draftHash");
});

it("retains canonical empty-draft and changed-publication comparisons", async () => {
  const emptyHash = contentHashForCatalogueContent(
    emptyCatalogueContent({
      kind: "course",
      code: "COMP1100",
      academicYear: 2026,
      title: "Fixture",
    }),
  );
  const empty = {
    ...record("COMP1100"),
    hasPublication: false,
    isPublished: false,
    draftHash: emptyHash,
  };
  rpc.mockResolvedValue({
    data: page([empty, { ...record("COMP1110"), draftHash: "different" }]),
    error: null,
  });
  const result = await loadCatalogueDirectoryPage({
    kind: "course",
    academicYear: 2026,
  });
  expect(result.records.map((row) => row.hasChanges)).toEqual([false, true]);
});

it("propagates directory permission and read failures", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "denied" },
  });
  await expect(
    loadCatalogueDirectoryPage({ kind: "course", academicYear: 2026 }),
  ).rejects.toMatchObject({ code: "42501" });
});

it("uses an aggregate for the six top courses instead of transferring every plan item", async () => {
  rpc.mockResolvedValue({
    data: [{ code: "COMP1100", students: 42 }],
    error: null,
  });
  const result = await loadAdminDashboard(new Date("2026-10-18T00:00:00Z"));
  expect(result.topCourses).toEqual([{ code: "COMP1100", students: 42 }]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("admin_top_courses", {
    p_limit: 6,
  });
  for (const call of from.mock.results) {
    expect(
      call.value.select.mock.calls.every(
        ([columns]: [string]) => !columns.includes("catalogue_record_id"),
      ),
    ).toBe(true);
  }
});

it("does not request other students' course counts without permission", async () => {
  canReadStudentRecords.mockResolvedValue(false);
  const result = await loadAdminDashboard(new Date("2026-10-18T00:00:00Z"));
  expect(result.topCourses).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
