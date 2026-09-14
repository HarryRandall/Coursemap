import assert from "node:assert/strict";
import { test } from "vitest";
import { createLocalDatabaseClient } from "../scripts/catalogue/lib/local-database.mjs";

test("annual UUIDs distinguish years and exist before content is imported", async () => {
  const sql = await createLocalDatabaseClient();
  const rollback = new Error("Intentional identity test rollback");
  try {
    await assert.rejects(
      sql.begin(async (tx) => {
        const missingCourses =
          await tx`select d.code from public.course_directory_entries d
        join public.courses c using(code)
        left join public.course_years y on y.course_id=c.id and y.academic_year_id=d.academic_year_id
        where y.public_id is null`;
        assert.equal(missingCourses.length, 0);
        const missingStructures =
          await tx`select d.code from public.academic_structure_directory_entries d
        join public.academic_structures s on s.code=d.code and s.kind=d.structure_kind
        left join public.academic_structure_years y on y.structure_id=s.id and y.academic_year_id=d.academic_year_id
        where y.public_id is null`;
        assert.equal(missingStructures.length, 0);
        const [course] =
          await tx`insert into public.courses(code) values ('UUID9999') returning id,public_id`;
        await tx`insert into public.academic_years(year) values (2198),(2199) on conflict do nothing`;
        const years =
          await tx`insert into public.course_years(course_id,academic_year_id)
        select ${course.id},id from public.academic_years where year in (2198,2199) returning public_id,draft_snapshot_id,published_snapshot_id`;
        assert.equal(years.length, 2);
        assert.notEqual(years[0].public_id, years[1].public_id);
        for (const year of years) {
          assert.notEqual(year.public_id, course.public_id);
          assert.equal(year.draft_snapshot_id, null);
          assert.equal(year.published_snapshot_id, null);
        }
        const [directory] =
          await tx`insert into public.course_directory_entries(academic_year_id, code, title, source_page_id)
          select academic_year_id, 'UUID9998', 'Unimported UUID regression', source_page_id
          from public.course_directory_entries limit 1 returning id,course_id`;
        assert.ok(directory);
        assert.equal(directory.course_id, null);
        const [workspace] =
          await tx`select d.course_year_id, y.public_id, d.draft_snapshot_id, d.published_snapshot_id
          from public.course_directory_admin_entries d
          join public.course_years y on y.id=d.course_year_id where d.id=${directory.id}`;
        assert.ok(
          workspace?.public_id,
          "An unimported directory row must resolve a clickable annual UUID",
        );
        assert.equal(workspace.draft_snapshot_id, null);
        assert.equal(workspace.published_snapshot_id, null);
        throw rollback;
      }),
      (error) => error === rollback,
    );
  } finally {
    await sql.end();
  }
});
