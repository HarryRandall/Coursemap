import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";

export type KnownCourseIdentity = { code: string; name: string };

/** Directory titles can identify prerequisites whose source prose omits a code. */
export async function loadKnownCourseIdentities(
  sql: SyncSql,
  academicYearId: number,
): Promise<KnownCourseIdentity[]> {
  const rows = await sql`
    select codes.code, listings.title as name
    from public.catalogue_listings as listings
    join public.catalogue_codes as codes on codes.id = listings.code_id
    where listings.academic_year_id = ${academicYearId}
      and listings.kind = 'course' and listings.is_current
      and listings.source_page_id is not null
      and listings.title is not null and btrim(listings.title) <> ''
    order by codes.code
  `;
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
  }));
}

function courseNameKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Filtering limits prompt size; the model still resolves the referenced identity. */
export function coursesMentionedOnPage(
  pageMarkdown: string,
  courses: readonly KnownCourseIdentity[],
) {
  const page = courseNameKey(pageMarkdown);
  return courses.filter((course) => page.includes(courseNameKey(course.name)));
}
