import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";

const KNOWN_TAG_LIMIT = 200;

/**
 * The tag names already in use: those degree rules count units against, and
 * those earlier courses were given. Offering them to the model keeps one
 * category from splitting into near-duplicates such as Science and Sciences,
 * which would stop a rule from matching the courses meant for it.
 */
export async function loadKnownCourseTags(sql: SyncSql): Promise<string[]> {
  const rows = await sql`
    select name
    from (
      select btrim(tag) as name from public.requirement_conditions
      where tag is not null and btrim(tag) <> ''
      union all
      select name from public.course_tags
    ) as used
    group by lower(name), name
    order by count(*) desc, name
    limit ${KNOWN_TAG_LIMIT}
  `;
  const seen = new Set<string>();
  return rows
    .map((row) => String(row.name))
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
