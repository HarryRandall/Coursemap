import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  tables,
  failures,
  reads,
  cachedReads,
  cacheTags,
  oversizedWrites,
  concurrency,
} = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
  cachedReads: new Map<string, unknown>(),
  cacheTags: new Map<string, string[]>(),
  oversizedWrites: [] as number[],
  concurrency: { active: 0, peak: 0, delay: 0 },
  failures: new Map<string, { code: string; message: string }>(),
  reads: [] as Array<{
    table: string;
    columns?: string;
    named?: string;
    ids?: unknown[];
    yearId?: unknown;
  }>,
}));

vi.mock("next/cache", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const cacheContext = new AsyncLocalStorage<boolean>();
  return {
    unstable_cache:
      (
        read: (...args: unknown[]) => Promise<unknown>,
        keyParts: string[] = [],
        options: { tags?: string[] } = {},
      ) =>
      async (...args: unknown[]) => {
        const key = JSON.stringify([read.toString(), keyParts, args]);
        if (!cacheContext.getStore() && cachedReads.has(key))
          return cachedReads.get(key);
        const result = await cacheContext.run(true, () => read(...args));
        const size = JSON.stringify(result).length;
        // Production Next.js silently declines oversized data-cache entries.
        if (size > 2 * 1024 * 1024) oversizedWrites.push(size);
        else {
          cachedReads.set(key, result);
          cacheTags.set(key, options.tags ?? []);
        }
        return result;
      },
    updateTag: (tag: string) => {
      for (const [key, tags] of cacheTags) {
        if (tags.includes(tag)) cachedReads.delete(key);
      }
    },
  };
});
vi.mock("../lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    async rpc(
      name: string,
      args?: { p_academic_year: number; p_course_code: string },
    ) {
      if (name === "published_course_filter_options") {
        reads.push({ table: name });
        return {
          data: tables.get("filter_options")?.[0] ?? null,
          error: failures.get(name) ?? null,
        };
      }
      if (!args) throw new Error("Missing graph arguments.");
      return {
        data: (tables.get("graph") ?? []).filter(
          (row) =>
            row.year === args.p_academic_year &&
            row.from_code === args.p_course_code,
        ),
        error: failures.get("graph") ?? null,
      };
    },
    from(table: string) {
      let rows = tables.get(table) ?? [];
      let bounded = table === "catalogue_records" || table === "academic_years";
      const read: (typeof reads)[number] = { table };
      reads.push(read);
      const query = {
        select: (columns: string) => {
          read.columns = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          if (column === "code") bounded = true;
          if (column === "academic_year_id") read.yearId = value;
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        is(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        not(column: string, _operator: string, value: unknown) {
          rows = rows.filter((row) => row[column] !== value);
          return query;
        },
        in(column: string, values: unknown[]) {
          read.ids = values;
          bounded = values.length <= 200;
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        ilike(column: string, value: string) {
          read.named = value;
          rows = rows.filter(
            (row) => String(row[column]).toLowerCase() === value.toLowerCase(),
          );
          return query;
        },
        order(column: string) {
          rows = [...rows].sort(
            (left, right) => Number(left[column]) - Number(right[column]),
          );
          return query;
        },
        range(start: number, end: number) {
          rows = rows.slice(start, end + 1);
          return query;
        },
        async maybeSingle() {
          return { data: rows[0] ?? null, error: failures.get(table) ?? null };
        },
        async then(resolve: (result: unknown) => unknown) {
          concurrency.active += 1;
          concurrency.peak = Math.max(concurrency.peak, concurrency.active);
          if (concurrency.delay) {
            await new Promise((done) => setTimeout(done, concurrency.delay));
          }
          concurrency.active -= 1;
          const error =
            failures.get(table) ??
            (!bounded ? { code: "57014", message: "statement timeout" } : null);
          return Promise.resolve(resolve({ data: error ? null : rows, error }));
        },
      };
      return query;
    },
  }),
}));

import {
  loadCourseDirectoryFilterOptions,
  loadPublishedCourseDirectoryPage,
  loadPublishedCourseYears,
  loadPublishedCoursePage,
} from "../lib/coursemap/published-courses";

import { revalidatePublishedRecord } from "../lib/coursemap/published-cache";

beforeEach(() => {
  cachedReads.clear();
  cacheTags.clear();
  oversizedWrites.length = 0;
  concurrency.active = 0;
  concurrency.peak = 0;
  concurrency.delay = 0;
  reads.length = 0;
  tables.clear();
  failures.clear();
  tables.set("filter_options", [
    {
      subjects: [{ code: "ECON", name: "Economics" }],
      years: [2026],
      units: [],
      modes: [],
      colleges: ["Business and Economics"],
      areas: ["Economics", "Finance"],
      tags: ["Business"],
    },
  ]);
  const records: Array<{
    id: number;
    kind: string;
    academic_year_id: number;
    archived_at: null;
    published_version_id: number | null;
  }> = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1,
    kind: "course",
    academic_year_id: 26,
    archived_at: null,
    published_version_id: index + 1,
  }));
  records.push({
    id: 1002,
    kind: "course",
    academic_year_id: 26,
    archived_at: null,
    published_version_id: null,
  });
  tables.set("academic_years", [
    { id: 26, year: 2026 },
    { id: 27, year: 2027 },
  ]);
  tables.set("catalogue_records", records);
  tables.set(
    "published_course_summaries",
    records.slice(0, 1001).map((record) => ({
      version_id: record.id,
      code: "ECON1101",
      academic_year: 2026,
      subject_code: "ECON",
      subject_name: "Economics",
      college: "Business and Economics",
    })),
  );
  tables.set("course_areas_of_interest", [
    ...Array.from({ length: 1001 }, (_, index) => ({
      id: index + 1,
      version_id: 1,
      name: "Economics",
    })),
    { id: 1002, version_id: 1001, name: "Finance" },
    { id: 1003, version_id: 1002, name: "Draft area" },
  ]);
  tables.set("course_tags", [
    { id: 1, version_id: 1001, name: "Business" },
    { id: 2, version_id: 1002, name: "Draft tag" },
  ]);
});

describe("published course directory loading", () => {
  it("loads every publication and relationship page without scanning drafts or timing out", async () => {
    expect(await loadCourseDirectoryFilterOptions()).toEqual({
      subjects: [{ code: "ECON", name: "Economics" }],
      years: [2026],
      units: [],
      modes: [],
      colleges: ["Business and Economics"],
      areas: ["Economics", "Finance"],
      tags: ["Business"],
    });
    expect(await loadPublishedCourseYears("ECON1101")).toHaveLength(1001);
  });

  it("applies area, tag and session filters within published versions", async () => {
    for (const filters of [
      { area: "Draft area" },
      { tag: "Draft tag" },
      { session: "S1" },
    ]) {
      expect(
        (await loadPublishedCourseDirectoryPage({ filters })).courses,
      ).toEqual([]);
    }
  });

  it("propagates bounded query failures instead of returning an empty catalogue", async () => {
    failures.set("published_course_filter_options", {
      code: "57014",
      message: "statement timeout",
    });
    await expect(loadCourseDirectoryFilterOptions()).rejects.toMatchObject({
      code: "57014",
    });
  });
});

it("filters the complete directory by published prerequisite edges in the requested year before pagination", async () => {
  const summaries = [
    {
      version_id: 1,
      code: "COMP2000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: "COMP",
    },
    {
      version_id: 2,
      code: "COMP2000",
      academic_year: 2027,
      academic_year_id: 27,
      subject_code: "COMP",
    },
    {
      version_id: 3,
      code: "COMP3000",
      academic_year: 2027,
      academic_year_id: 27,
      subject_code: "COMP",
    },
    {
      version_id: 4,
      code: "COMP4000",
      academic_year: 2027,
      academic_year_id: 27,
      subject_code: "COMP",
    },
  ];
  tables.set(
    "catalogue_records",
    summaries.map((row) => ({
      id: row.version_id,
      kind: "course",
      academic_year_id: row.academic_year_id,
      archived_at: null,
      published_version_id: row.version_id,
    })),
  );
  tables.set("published_course_summaries", summaries);
  tables.set("graph", [
    { year: 2027, from_code: "COMP1000", to_code: "COMP2000" },
    { year: 2027, from_code: "COMP1000", to_code: "COMP3000" },
    { year: 2026, from_code: "COMP1000", to_code: "COMP4000" },
    { year: 2027, from_code: "COMP9999", to_code: "COMP4000" },
  ]);
  tables.set("course_areas_of_interest", []);
  tables.set("course_tags", []);
  const result = await loadPublishedCourseDirectoryPage({
    academicYear: 2027,
    filters: { prerequisite: "COMP1000" },
    page: 2,
    pageSize: 1,
  });
  expect(result.total).toBe(2);
  expect(result.courses.map((course) => [course.code, course.year])).toEqual([
    ["COMP3000", 2027],
  ]);
});

it("does not broaden an invalid prerequisite filter or hide graph failures", async () => {
  expect(
    (
      await loadPublishedCourseDirectoryPage({
        filters: { prerequisite: "invalid" },
      })
    ).total,
  ).toBe(0);
  failures.set("graph", { code: "57014", message: "statement timeout" });
  await expect(
    loadPublishedCourseDirectoryPage({
      academicYear: 2027,
      filters: { prerequisite: "COMP1000" },
    }),
  ).rejects.toMatchObject({ code: "57014" });
});

it("loads one course's years without a cold fill of the entire directory", async () => {
  expect(await loadPublishedCourseYears("ECON1101")).toHaveLength(1001);
  expect(
    reads.every(
      (read) =>
        read.table === "published_course_summaries" &&
        read.columns === "academic_year",
    ),
  ).toBe(true);
});

it("reuses bounded published name batches instead of scanning tags by name", async () => {
  await loadPublishedCourseDirectoryPage({
    academicYear: 2026,
    filters: { tag: "bUsInEsS" },
  });
  expect(
    reads
      .filter((read) => read.table === "course_tags")
      .every((read) => !read.named && (read.ids?.length ?? 0) <= 200),
  ).toBe(true);
});

it("bounds catalogue code lookups even when one page references hundreds of courses", async () => {
  tables.set("requirement_rules", [
    {
      id: 1,
      version_id: 1,
      rule_kind: "prerequisite",
      source_text: "Required courses",
      confidence: 1,
      review_state: "verified",
    },
  ]);
  tables.set(
    "requirement_item_references",
    Array.from({ length: 201 }, (_, index) => ({
      rule_id: 1,
      code_id: index + 1,
    })),
  );
  tables.set(
    "catalogue_codes",
    Array.from({ length: 201 }, (_, index) => ({
      id: index + 1,
      code: `COMP${1100 + index}`,
    })),
  );
  const result = await loadPublishedCourseDirectoryPage({ pageSize: 1 });
  expect(result.courses[0]?.prerequisiteCodes).toHaveLength(201);
  expect(
    reads
      .filter((read) => read.table === "catalogue_codes")
      .map((read) => read.ids?.length),
  ).toEqual([100, 100, 1]);
});

it("loads global filter options in one compact RPC without filling the directory", async () => {
  await loadCourseDirectoryFilterOptions();
  expect(reads).toEqual([{ table: "published_course_filter_options" }]);
});

it("filters by teaching period code, unit value and delivery mode", async () => {
  tables.set(
    "catalogue_records",
    [1, 2, 3].map((id) => ({
      id,
      kind: "course",
      archived_at: null,
      published_version_id: id,
    })),
  );
  tables.set("published_course_summaries", [
    {
      version_id: 1,
      code: "ECON1101",
      academic_year: 2026,
      units: 6,
      delivery_summary: "In Person",
    },
    {
      version_id: 2,
      code: "ECON1102",
      academic_year: 2026,
      units: 12,
      delivery_summary: "Online",
    },
    {
      version_id: 3,
      code: "ECON1103",
      academic_year: 2026,
      units: 6,
      delivery_summary: "Online",
    },
  ]);
  tables.set("offering_sessions", [
    {
      id: 1,
      version_id: 1,
      academic_period_code: "SPRING",
      academic_period_name: "Spring Session",
    },
    {
      id: 2,
      version_id: 3,
      academic_period_code: "S1",
      academic_period_name: "First Semester",
    },
  ]);
  const codes = async (filters: Record<string, string>) =>
    (await loadPublishedCourseDirectoryPage({ filters })).courses.map(
      (course) => course.code,
    );
  expect(await codes({ session: "SPRING" })).toEqual(["ECON1101"]);
  expect(await codes({ session: "S1" })).toEqual(["ECON1103"]);
  expect(await codes({ units: "6" })).toEqual(["ECON1101", "ECON1103"]);
  expect(await codes({ mode: "Online", units: "6" })).toEqual(["ECON1103"]);
  tables.set("filter_options", [
    {
      ...tables.get("filter_options")?.[0],
      units: [12, 6],
      modes: ["Online", "In Person"],
    },
  ]);
  expect(await loadCourseDirectoryFilterOptions()).toMatchObject({
    units: [6, 12],
    modes: ["In Person", "Online"],
  });
});

it("keeps both level bounds and subject sets before directory pagination", async () => {
  tables.set("academic_years", [
    { id: 25, year: 2025 },
    { id: 26, year: 2026 },
  ]);
  tables.set(
    "catalogue_records",
    Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      kind: "course",
      archived_at: null,
      academic_year_id: index === 5 ? 26 : 25,
      published_version_id: index + 1,
    })),
  );
  tables.set("published_course_summaries", [
    {
      version_id: 1,
      code: "COMP1100",
      academic_year: 2025,
      level: 1000,
      subject_code: "COMP",
    },
    {
      version_id: 2,
      code: "COMP2100",
      academic_year: 2025,
      level: 2000,
      subject_code: "COMP",
    },
    {
      version_id: 3,
      code: "MATH3100",
      academic_year: 2025,
      level: 3000,
      subject_code: "MATH",
    },
    {
      version_id: 4,
      code: "COMP4100",
      academic_year: 2025,
      level: 4000,
      subject_code: "COMP",
    },
    {
      version_id: 5,
      code: "BIOL3100",
      academic_year: 2025,
      level: 3000,
      subject_code: "BIOL",
    },
    {
      version_id: 6,
      code: "COMP3100",
      academic_year: 2026,
      level: 3000,
      subject_code: "COMP",
    },
  ]);
  const bounded = await loadPublishedCourseDirectoryPage({
    academicYear: 2025,
    filters: { subject: "COMP MATH", level: "2-3" },
    pageSize: 1,
  });
  expect(bounded.total).toBe(2);
  expect(bounded.courses.map((course) => course.code)).toEqual(["COMP2100"]);
  const capped = await loadPublishedCourseDirectoryPage({
    academicYear: 2025,
    filters: { subject: "COMP", level: "1-3" },
  });
  expect(capped.courses.map((course) => course.code)).toEqual([
    "COMP1100",
    "COMP2100",
  ]);
  const listed = await loadPublishedCourseDirectoryPage({
    academicYear: 2025,
    filters: { codes: "COMP1100,MATH3100" },
  });
  expect(listed.courses.map((course) => course.code)).toEqual([
    "COMP1100",
    "MATH3100",
  ]);
});

it("retains a multi-year directory larger than the data-cache limit across page selections", async () => {
  const summaries = Array.from({ length: 6200 }, (_, index) => ({
    version_id: index + 1,
    code: `COMP${String(index).padStart(4, "0")}`,
    title: "A".repeat(400),
    academic_year: 2026,
    academic_year_id: 26,
    subject_code: "COMP",
  }));
  expect(JSON.stringify(summaries).length).toBeGreaterThan(2 * 1024 * 1024);
  tables.set("published_course_summaries", summaries);
  tables.set(
    "catalogue_records",
    summaries.map((row) => ({
      id: row.version_id,
      kind: "course",
      academic_year_id: row.academic_year_id,
      archived_at: null,
      published_version_id: row.version_id,
    })),
  );
  tables.set("course_areas_of_interest", []);
  tables.set("course_tags", []);
  await loadPublishedCourseDirectoryPage({ page: 1 });
  reads.length = 0;
  const result = await loadPublishedCourseDirectoryPage({ page: 2 });
  expect(result.total).toBe(6200);
  expect(result.courses[0]?.code).toBe("COMP0024");
  expect(reads.some((read) => read.table === "catalogue_records")).toBe(false);
  expect(
    reads.filter((read) => read.table === "published_course_summaries"),
  ).toHaveLength(1);
  expect(oversizedWrites).toEqual([]);
});

it("reuses hydrated pages and filter options without database reads", async () => {
  const options = await loadCourseDirectoryFilterOptions();
  const first = await loadPublishedCourseDirectoryPage({});
  reads.length = 0;
  expect(await loadCourseDirectoryFilterOptions()).toEqual(options);
  expect(await loadPublishedCourseDirectoryPage({})).toEqual(first);
  expect(reads).toEqual([]);
});

it("refreshes directory batches, filter options and hydrated pages after publication", async () => {
  await loadCourseDirectoryFilterOptions();
  await loadPublishedCourseDirectoryPage({});
  tables.set(
    "published_course_summaries",
    (tables.get("published_course_summaries") ?? []).map((row) => ({
      ...row,
      title: "Published replacement",
      academic_year: 2027,
    })),
  );
  tables.set("filter_options", [
    { ...tables.get("filter_options")?.[0], years: [2027] },
  ]);
  revalidatePublishedRecord({
    kind: "course",
    academicYear: 2027,
    code: "ECON1101",
  });
  expect((await loadCourseDirectoryFilterOptions()).years).toEqual([2027]);
  const refreshed = await loadPublishedCourseDirectoryPage({});
  expect(refreshed.courses[0]?.name).toBe("Published replacement");
  expect(refreshed.courses[0]?.year).toBe(2027);
});

it("overlaps cold directory reads without exceeding four concurrent batches", async () => {
  concurrency.delay = 1;
  await loadPublishedCourseDirectoryPage({ pageSize: 1 });
  expect(concurrency.peak).toBe(4);
  expect(concurrency.active).toBe(0);
});

it("limits year-specific directory and session reads to that year's published versions", async () => {
  const summaries = [
    {
      version_id: 1,
      code: "COMP2400",
      title: "Relational databases",
      academic_year: 2026,
      academic_year_id: 26,
    },
    {
      version_id: 2,
      code: "COMP2400",
      title: "Older databases",
      academic_year: 2025,
      academic_year_id: 25,
    },
  ];
  tables.set(
    "catalogue_records",
    summaries.map((row) => ({
      id: row.version_id,
      kind: "course",
      academic_year_id: row.academic_year_id,
      archived_at: null,
      published_version_id: row.version_id,
    })),
  );
  tables.set("published_course_summaries", summaries);
  tables.set(
    "offering_sessions",
    summaries.map((row) => ({
      id: row.version_id,
      version_id: row.version_id,
      academic_period_code: "S1",
    })),
  );
  const result = await loadPublishedCourseDirectoryPage({
    academicYear: 2026,
    filters: { session: "S1" },
  });
  expect(result.courses.map((course) => [course.code, course.year])).toEqual([
    ["COMP2400", 2026],
  ]);
  expect(
    reads
      .filter((read) => read.table === "catalogue_records")
      .every((read) => read.yearId === 26),
  ).toBe(true);
  expect(
    reads.filter((read) => read.ids).every((read) => !read.ids?.includes(2)),
  ).toBe(true);
});

it("returns an empty unavailable year without reading publication batches", async () => {
  expect(
    (await loadPublishedCourseDirectoryPage({ academicYear: 1900 })).total,
  ).toBe(0);
  expect(reads.map((read) => read.table)).toEqual(["academic_years"]);
});

it("sorts compact options and rejects malformed RPC results", async () => {
  tables.set("filter_options", [
    {
      ...tables.get("filter_options")?.[0],
      years: [2025, 2027, 2026],
      units: [12, 6],
      areas: ["Zoology", "Biology", "biology"],
    },
  ]);
  expect(await loadCourseDirectoryFilterOptions()).toMatchObject({
    years: [2027, 2026, 2025],
    units: [6, 12],
    areas: ["biology", "Zoology"],
  });
  cachedReads.clear();
  tables.set("filter_options", [{ subjects: "invalid" }]);
  await expect(loadCourseDirectoryFilterOptions()).rejects.toThrow(
    "The course filter options could not be loaded.",
  );
});

it("shares bounded directory batches with candidate pages and preserves subject/title pagination", async () => {
  tables.set(
    "catalogue_records",
    [1, 2, 3].map((id) => ({
      id,
      kind: "course",
      academic_year_id: 26,
      archived_at: null,
      published_version_id: id,
    })),
  );
  tables.set("published_course_summaries", [
    {
      version_id: 1,
      code: "COMP1000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: "COMP",
      title: "Zoology",
    },
    {
      version_id: 2,
      code: "COMP2000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: "COMP",
      title: "Algorithms",
    },
    {
      version_id: 3,
      code: "MATH1000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: "MATH",
      title: "Algebra",
    },
  ]);
  await loadPublishedCourseDirectoryPage({ academicYear: 2026, pageSize: 1 });
  reads.length = 0;
  const result = await loadPublishedCoursePage({
    academicYear: 2026,
    page: 2,
    pageSize: 1,
    filters: { subject: "COMP" },
  });
  expect(result.total).toBe(2);
  expect(result.courses.map((course) => course.code)).toEqual(["COMP1000"]);
  expect(reads.some((read) => read.table === "catalogue_records")).toBe(false);
  expect(
    reads.filter((read) => read.table === "published_course_summaries"),
  ).toHaveLength(0);
});

it("uses teaching-period names for candidate pages and propagates their read failures", async () => {
  tables.set("offering_sessions", [
    {
      id: 1,
      version_id: 1,
      academic_period_code: "S1",
      academic_period_name: "First Semester",
    },
  ]);
  expect(
    (
      await loadPublishedCoursePage({
        academicYear: 2026,
        filters: { session: "First Semester" },
      })
    ).total,
  ).toBe(1);
  expect(
    (
      await loadPublishedCoursePage({
        academicYear: 2026,
        filters: { session: "S1" },
      })
    ).total,
  ).toBe(0);
  failures.set("offering_sessions", {
    code: "57014",
    message: "statement timeout",
  });
  await expect(
    loadPublishedCoursePage({
      academicYear: 2026,
      filters: { session: "Summer" },
    }),
  ).rejects.toMatchObject({ code: "57014" });
});

it("places courses without a subject last in candidate search pagination", async () => {
  tables.set(
    "catalogue_records",
    [1, 2].map((id) => ({
      id,
      kind: "course",
      academic_year_id: 26,
      archived_at: null,
      published_version_id: id,
    })),
  );
  tables.set("published_course_summaries", [
    {
      version_id: 1,
      code: "AAAA1000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: null,
      title: "First alphabetically",
    },
    {
      version_id: 2,
      code: "COMP2000",
      academic_year: 2026,
      academic_year_id: 26,
      subject_code: "COMP",
      title: "Zoology",
    },
  ]);
  const first = await loadPublishedCoursePage({
    academicYear: 2026,
    pageSize: 1,
  });
  expect(first.total).toBe(2);
  expect(first.courses.map((course) => course.code)).toEqual(["COMP2000"]);
  const second = await loadPublishedCoursePage({
    academicYear: 2026,
    pageSize: 1,
    page: 2,
  });
  expect(second.courses.map((course) => course.code)).toEqual(["AAAA1000"]);
});
