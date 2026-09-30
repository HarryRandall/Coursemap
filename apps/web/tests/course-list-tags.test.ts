import assert from "node:assert/strict";
import { test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withCourseListTags } from "../lib/catalogue/course-list-tags.ts";
import type { Database } from "../types/database.ts";

function clientReturning(
  rows: { academic_year: number; course_code: string; tag: string }[],
) {
  const calls: unknown[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: rows, error: null };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

test("adds published list names as tags for the matching course year", async () => {
  const { client, calls } = clientReturning([
    { academic_year: 2026, course_code: "TSTL1001", tag: "List A" },
    { academic_year: 2026, course_code: "TSTL1001", tag: "science" },
  ]);
  const courses = await withCourseListTags(client, [
    { code: "tstl1001", year: 2026, tags: ["Science"] },
    { code: "TSTL1001", year: 2025 },
  ]);
  assert.deepEqual(courses, [
    { code: "tstl1001", year: 2026, tags: ["Science", "List A"] },
    { code: "TSTL1001", year: 2025 },
  ]);
  assert.deepEqual(calls, [
    {
      name: "published_course_list_tags",
      args: { p_years: [2026, 2025], p_codes: ["TSTL1001"] },
    },
  ]);
});

test("skips the lookup when there are no courses", async () => {
  const { client, calls } = clientReturning([]);
  assert.deepEqual(await withCourseListTags(client, []), []);
  assert.equal(calls.length, 0);
});
