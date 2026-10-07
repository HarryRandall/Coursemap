import "server-only";

import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";

export type ImportScopeStructure = {
  recordId: number;
  kind: "programme" | "major" | "minor" | "specialisation";
  code: string;
  name: string;
  courseCount: number;
};

// A structure names courses in three places: plain item references, course
// conditions and the options of a choice. All three count towards its scope.
// The version is the published one, or the latest imported source when the
// structure has not been published yet.
const STRUCTURE_COURSES = `
  with versions as (
    select records.id as record_id,
      coalesce(records.published_version_id, records.latest_source_version_id) as version_id
    from public.catalogue_records records
    join public.academic_years years on years.id = records.academic_year_id
    where records.kind in ('programme', 'major', 'minor', 'specialisation')
      and years.year = $1
      and records.archived_at is null
  ),
  referenced as (
    select version_id, code_id from public.requirement_item_references
    union
    select version_id, code_id from public.requirement_conditions where code_id is not null
    union
    select version_id, code_id from public.requirement_condition_options where code_id is not null
  ),
  structure_courses as (
    select versions.record_id, codes.code
    from versions
    join referenced on referenced.version_id = versions.version_id
    join public.catalogue_codes codes on codes.id = referenced.code_id and codes.kind = 'course'
  )
`;

/** Structures in a year that name at least one course, by kind then code. */
export async function listImportScopeStructures(
  year: number,
): Promise<ImportScopeStructure[]> {
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql.unsafe(
      `${STRUCTURE_COURSES}
      select records.id as record_id, records.kind, codes.code,
        coalesce(details.name, codes.code) as name,
        count(distinct structure_courses.code)::integer as course_count
      from structure_courses
      join public.catalogue_records records on records.id = structure_courses.record_id
      join public.catalogue_codes codes on codes.id = records.code_id
      left join public.structure_version_details details
        on details.version_id = coalesce(records.published_version_id, records.latest_source_version_id)
      group by records.id, records.kind, codes.code, details.name
      order by array_position(array['programme', 'major', 'minor', 'specialisation'], records.kind), codes.code`,
      [year],
    );
    return rows.map((row) => ({
      recordId: Number(row.record_id),
      kind: row.kind,
      code: row.code,
      name: row.name,
      courseCount: row.course_count,
    }));
  });
}

/** Every course code named by the chosen structures, sorted and unique. */
export async function importScopeCourseCodes(
  year: number,
  recordIds: readonly number[],
): Promise<string[]> {
  if (recordIds.length === 0) return [];
  return withSyncDatabaseClient(async (sql) => {
    const rows = await sql.unsafe(
      `${STRUCTURE_COURSES}
      select distinct code from structure_courses
      where record_id = any($2::bigint[])
      order by code`,
      [year, recordIds as number[]],
    );
    return rows.map((row) => row.code as string);
  });
}
