import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  ownedRpc: vi.fn(),
  periods: vi.fn(),
  caches: [] as Map<string, unknown>[],
}));
vi.mock("react", () => ({
  cache: (read: (...args: unknown[]) => unknown) => {
    const values = new Map<string, unknown>();
    mocks.caches.push(values);
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!values.has(key)) values.set(key, read(...args));
      return values.get(key);
    };
  },
}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.ownedRpc,
    from: () => ({ select: () => ({ in: mocks.periods }) }),
  }),
}));
import {
  loadAttemptCalendarYears,
  loadOwnedAttemptProjections,
  loadPublishedTdDesignations,
} from "@/lib/coursemap/historical-td-evidence";

function evidence(code: string, year: number) {
  return {
    record_id: 1,
    snapshot_id: 10,
    code,
    academic_year: year,
    tags: ["Transdisciplinary"],
    provenance: [
      {
        field_path: "course.tags",
        method: "deterministic",
        confidence: 1,
        source_locator: `https://programsandcourses.anu.edu.au/data/CourseSearch/GetCourses?SelectedYear=${year}&GraduateAttributes%5B2%5D=Transdisciplinary+Problem-Solving`,
        source_excerpt: JSON.stringify({
          repair: "Canonical ANU transdisciplinary designation",
          sourceHash: "a".repeat(64),
          planHash: "b".repeat(64),
          retrievedAt: "2026-10-20T10:00:00Z",
          sourceExcerpt: {
            code,
            year,
            designation: "Transdisciplinary Problem-Solving",
          },
        }),
      },
    ],
  };
}
beforeEach(() => {
  for (const values of mocks.caches) values.clear();
  mocks.rpc.mockReset();
  mocks.ownedRpc.mockReset();
  mocks.periods.mockReset();
  mocks.rpc.mockImplementation(async (_name, args) => ({
    data: args.p_selections.map((s: { code: string; year: number }) =>
      evidence(s.code, s.year),
    ),
    error: null,
  }));
});

test("normalises and memoises equivalent exact-year selections in one request", async () => {
  const first = await loadPublishedTdDesignations([
    { code: " infs2005 ", year: 2026 },
    { code: "INFS2005", year: 2026 },
  ]);
  expect(first).toEqual([{ code: "INFS2005", year: 2026, status: "member" }]);
  await loadPublishedTdDesignations([{ code: "INFS2005", year: 2026 }]);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
test("does not borrow a later edition's designation", async () => {
  mocks.rpc.mockResolvedValue({
    data: [evidence("INFS2005", 2027)],
    error: null,
  });
  expect(
    await loadPublishedTdDesignations([{ code: "INFS2005", year: 2026 }]),
  ).toEqual([{ code: "INFS2005", year: 2026, status: "unknown" }]);
});
test("batches large histories without one RPC per course", async () => {
  const courses = Array.from({ length: 205 }, (_, i) => ({
    code: `TEST${1000 + i}`,
    year: 2026,
  }));
  expect(await loadPublishedTdDesignations(courses)).toHaveLength(205);
  expect(
    mocks.rpc.mock.calls.map((call) => call[1].p_selections.length),
  ).toEqual([100, 100, 5]);
});
test.each([false, true])(
  "unavailable evidence remains unknown, including thrown failures (%s)",
  async (throws) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (throws) mocks.rpc.mockRejectedValue(new Error("offline"));
    else
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: "RPC unavailable" },
      });
    expect(
      await loadPublishedTdDesignations([{ code: "INFS2005", year: 2026 }]),
    ).toEqual([{ code: "INFS2005", year: 2026, status: "unknown" }]);
    log.mockRestore();
  },
);
test("duplicate or malformed oracle rows cannot promote a designation", async () => {
  mocks.rpc.mockResolvedValue({
    data: [evidence("INFS2005", 2026), evidence("INFS2005", 2026)],
    error: null,
  });
  expect(
    (await loadPublishedTdDesignations([{ code: "INFS2005", year: 2026 }]))[0]
      ?.status,
  ).toBe("unknown");
});
test("uses period calendar years and leaves missing periods unknown", async () => {
  mocks.periods.mockResolvedValue({
    data: [{ id: 5, calendar_year: 2027 }],
    error: null,
  });
  const attempts = [
    { id: "a", academic_period_id: 5 },
    { id: "b", academic_period_id: 6 },
    { id: "c", academic_period_id: null },
  ];
  expect(await loadAttemptCalendarYears(attempts)).toEqual({ a: 2027 });
  await loadAttemptCalendarYears([...attempts].reverse());
  expect(mocks.periods).toHaveBeenCalledTimes(1);
});
test("historical projections keep the existing owner-only RPC and its200-ID bound", async () => {
  mocks.ownedRpc.mockImplementation(async (_name, args) => ({
    data: args.p_version_ids.map((id: number) => ({
      version_id: id,
      projection: {},
    })),
    error: null,
  }));
  expect(
    await loadOwnedAttemptProjections(
      Array.from({ length: 401 }, (_, i) => i + 1),
    ),
  ).toHaveLength(401);
  expect(
    mocks.ownedRpc.mock.calls.map((call) => [
      call[0],
      call[1].p_version_ids.length,
    ]),
  ).toEqual([
    ["current_user_course_attempt_version_projections", 200],
    ["current_user_course_attempt_version_projections", 200],
    ["current_user_course_attempt_version_projections", 1],
  ]);
});
test("empty and invalid selections make no catalogue calls", async () => {
  expect(
    await loadPublishedTdDesignations([
      { code: "custom", year: 2026 },
      { code: "INFS2005", year: 0 },
    ]),
  ).toEqual([]);
  expect(await loadOwnedAttemptProjections([])).toEqual([]);
  expect(await loadAttemptCalendarYears([])).toEqual({});
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.ownedRpc).not.toHaveBeenCalled();
  expect(mocks.periods).not.toHaveBeenCalled();
});
