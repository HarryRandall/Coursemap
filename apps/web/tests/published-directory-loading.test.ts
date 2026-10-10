import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, failures, reads } = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
  failures: new Map<string, { code: string; message: string }>(),
  reads: [] as Array<{
    table: string;
    columns?: string;
    named?: string;
    ids?: unknown[];
  }>,
}));

vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
vi.mock("../lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    async rpc(
      _name: string,
      args: { p_academic_year: number; p_course_code: string },
    ) {
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
      let bounded = table === "catalogue_records";
      const read: (typeof reads)[number] = { table };
      reads.push(read);
      const query = {
        select: (columns: string) => {
          read.columns = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          if (column === "code") bounded = true;
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
          bounded = values.length <= 100;
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
        then(resolve: (result: unknown) => unknown) {
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
} from "../lib/coursemap/published-courses";

beforeEach(() => {
  reads.length = 0;
  tables.clear();
  failures.clear();
  const records: Array<{
    id: number;
    kind: string;
    archived_at: null;
    published_version_id: number | null;
  }> = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1,
    kind: "course",
    archived_at: null,
    published_version_id: index + 1,
  }));
  records.push({
    id: 1002,
    kind: "course",
    archived_at: null,
    published_version_id: null,
  });
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
      { session: "Semester 1" },
    ]) {
      expect(
        (await loadPublishedCourseDirectoryPage({ filters })).courses,
      ).toEqual([]);
    }
  });

  it("propagates bounded query failures instead of returning an empty catalogue", async () => {
    failures.set("course_tags", {
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
      .every((read) => !read.named && (read.ids?.length ?? 0) <= 100),
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

it("shares publication IDs between both name batches on a cold filter-options fill", async () => {
  await loadCourseDirectoryFilterOptions();
  // Two publication pages each for the directory and the shared name lookup.
  expect(
    reads.filter((read) => read.table === "catalogue_records"),
  ).toHaveLength(4);
});
