-- Explicit approval for test fixtures whose subject is downstream publication.
-- The dedicated lifecycle tests exercise missing approval and invalidation.
create temp table if not exists catalogue_review_fixture_context(id integer);
create function pg_temp.approve_catalogue_fixture(kind text, snapshot_id bigint)
returns void language plpgsql security definer set search_path = '' as $$ begin
insert into public.catalogue_section_reviews(course_year_id, structure_year_id,
section_key, content_hash, approved, method, version_id) select case when kind =
'course' then (select course_year_id from public.course_snapshots where id =
snapshot_id) end, case when kind <> 'course' then (select structure_year_id from
public.academic_structure_snapshots where id = snapshot_id) end,
sections.section_key, sections.content_hash, true, 'manual', case when kind =
'course' then (select public_id from public.course_snapshots where id =
snapshot_id) else (select public_id from public.academic_structure_snapshots
where id = snapshot_id) end from private.catalogue_review_sections(kind,
snapshot_id) sections; end; $$;
