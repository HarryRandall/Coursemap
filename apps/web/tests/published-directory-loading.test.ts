import { beforeEach, describe, expect, it, vi } from "vitest";

const { tables, failures } = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
  failures: new Map<string, { code: string; message: string }>(),
}));

vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
vi.mock("../lib/supabase/public-server", () => ({
  createPublicClient: () => ({
    from(table: string) {
      let rows = tables.get(table) ?? [];
      let bounded = table === "catalogue_records";
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
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
          bounded = values.length <= 100;
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        ilike(column: string, value: string) {
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
