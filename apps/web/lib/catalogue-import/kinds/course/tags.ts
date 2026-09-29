import type { SyncSql } from "../../../catalogue-sync/sync-store.ts";

const KNOWN_TAG_LIMIT = 200;

/**
 * Reviewed tag names from published degree rules and course versions.
 * Unpublished model suggestions must not establish the vocabulary. Offering
 * these names to the model keeps one
 * category from splitting into near-duplicates such as Science and Sciences,
 * which would stop a rule from matching the courses meant for it.
 */
export async function loadKnownCourseTags(sql: SyncSql): Promise<string[]> {
  const rows = await sql`
    select name
    from (
      select btrim(conditions.tag) as name
      from public.requirement_conditions conditions
      join public.catalogue_records records on records.published_version_id = conditions.version_id
      where conditions.tag is not null and btrim(conditions.tag) <> '' and records.archived_at is null
      union all
      select tags.name from public.course_tags tags
      join public.catalogue_records records on records.published_version_id = tags.version_id
      where records.archived_at is null
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
