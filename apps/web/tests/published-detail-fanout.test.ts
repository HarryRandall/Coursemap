import { beforeEach, expect, test, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc }),
}));
import {
  loadPublishedCoursesByCodes,
  loadPublishedCoursesBySelections,
} from "@/lib/coursemap/published-courses";
beforeEach(() => {
  rpc.mockReset();
});

type BatchArgs = { p_course_codes: string[]; p_academic_year: number };

function batchRows(args: BatchArgs, missing: readonly string[] = []) {
  return args.p_course_codes
    .filter((code) => !missing.includes(code))
    .map((code) => ({
      course_code: code,
      detail: {
        code,
        academicYear: args.p_academic_year,
        snapshotId: 1,
        snapshot: { title: code },
        prerequisiteEdges: [],
      },
    }));
}

test.each(["codes", "selections"])(
  "reads %s in batches of 12, at most two calls at once, keeping normalisation",
  async (kind) => {
    let active = 0;
    let maximum = 0;
    rpc.mockImplementation(async (_name: string, args: BatchArgs) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { data: batchRows(args), error: null };
    });
    const codes = Array.from(
      { length: 120 },
      (_, index) => `COMP${1100 + index}`,
    );
    const courses =
      kind === "codes"
        ? await loadPublishedCoursesByCodes(
            [...codes, "comp1100", "invalid"],
            2026,
          )
        : await loadPublishedCoursesBySelections([
            ...codes.map((code) => ({ code, year: 2026 })),
            { code: "comp1100", year: 2026 },
            { code: "invalid", year: 2026 },
          ]);
    expect(courses.map((course) => course.code)).toEqual(codes);
    expect(rpc).toHaveBeenCalledTimes(10);
    for (const [name, args] of rpc.mock.calls) {
      expect(name).toBe("published_course_details");
      expect(args.p_course_codes.length).toBeLessThanOrEqual(12);
    }
    expect(maximum).toBeLessThanOrEqual(2);
  },
);

test("selections from different years are read per year and keep their order", async () => {
  rpc.mockImplementation(async (_name: string, args: BatchArgs) => ({
    data: batchRows(args, ["MISS1000"]),
    error: null,
  }));
  const courses = await loadPublishedCoursesBySelections([
    { code: "MATH1013", year: 2026 },
    { code: "COMP1100", year: 2025 },
    { code: "MISS1000", year: 2026 },
    { code: "COMP1100", year: 2026 },
  ]);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(courses.map((course) => `${course.code}:${course.year}`)).toEqual([
    "MATH1013:2026",
    "COMP1100:2025",
    "COMP1100:2026",
  ]);
});

test("a failed detail read still rejects instead of dropping the course", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "statement timeout" },
  });
  await expect(loadPublishedCoursesByCodes(["COMP1100"], 2026)).rejects.toThrow(
    "statement timeout",
  );
});

test("splits timed-out rich projections without losing courses or changing their order", async () => {
  let active = 0;
  let maximum = 0;
  rpc.mockImplementation(async (_name: string, args: BatchArgs) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return args.p_course_codes.length > 3
      ? { data: null, error: { code: "57014", message: "statement timeout" } }
      : { data: batchRows(args), error: null };
  });
  const codes = Array.from({ length: 30 }, (_, index) => `COMP${1130 - index}`);
  const courses = await loadPublishedCoursesByCodes(
    [...codes, "comp1130"],
    2026,
  );
  expect(courses.map((course) => course.code)).toEqual(codes);
  expect(maximum).toBeLessThanOrEqual(2);
  expect(
    rpc.mock.calls.every(([, args]) => args.p_course_codes.length <= 12),
  ).toBe(true);
});

test("a timeout for one course terminates instead of retrying forever or omitting it", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "57014", message: "statement timeout" },
  });
  await expect(
    loadPublishedCoursesByCodes(
      ["COMP1100", "COMP1110", "COMP2100", "COMP2400"],
      2026,
    ),
  ).rejects.toThrow("statement timeout");
  expect(rpc.mock.calls.map(([, args]) => args.p_course_codes.length)).toEqual([
    4, 2, 1,
  ]);
});

test("other detail errors propagate without subdividing the batch", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  await expect(
    loadPublishedCoursesByCodes(["COMP1100", "COMP1110"], 2026),
  ).rejects.toThrow("permission denied");
  expect(rpc).toHaveBeenCalledTimes(1);
});
