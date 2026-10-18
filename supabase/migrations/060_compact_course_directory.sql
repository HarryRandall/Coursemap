-- Compact pages choose the preferred edition before pagination and skip
-- repeated permission work across every historical edition.
create function public.published_course_directory_page(
  p_academic_year integer default null, p_offset integer default 0,
  p_limit integer default 500
) returns jsonb language sql stable security definer set search_path = '' as $$
  with preferred as materialized (
    select distinct on (codes.code)
      years.year as academic_year, years.id as academic_year_id,
      codes.code, details.college, details.convener_text, details.delivery_summary,
      details.level, details.school, details.subject_code, details.subject_name,
      details.title, details.units, versions.id as version_id
    from public.catalogue_records records
    join public.catalogue_codes codes on codes.id = records.code_id
    join public.academic_years years on years.id = records.academic_year_id
    join public.catalogue_versions versions on versions.id = records.published_version_id
    join public.course_version_details details on details.version_id = versions.id
    where records.kind = 'course' and records.archived_at is null
      and (p_academic_year is null or years.year = p_academic_year)
    order by codes.code, (years.year = 2026) desc, years.year desc
  ), page as (
    select * from preferred order by code
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
  ) select coalesce(jsonb_agg(to_jsonb(page) order by code), '[]'::jsonb) from page;
$$;

-- Transfer only matching identifiers. Each filter reads its own metadata.
create function public.published_course_filter_versions(
  p_academic_year integer default null, p_kind text default null, p_value text default null
) returns jsonb language sql stable security definer set search_path = '' as $$
  with published as materialized (
    select records.published_version_id as version_id
    from public.catalogue_records records
    join public.academic_years years on years.id = records.academic_year_id
    where records.kind = 'course' and records.archived_at is null
      and records.published_version_id is not null
      and (p_academic_year is null or years.year = p_academic_year)
  ), matches as (
    select names.version_id from public.course_areas_of_interest names join published using (version_id)
    where p_kind = 'area' and lower(names.name) = lower(p_value)
    union
    select names.version_id from public.course_tags names join published using (version_id)
    where p_kind = 'tag' and lower(names.name) = lower(p_value)
    union
    select sessions.version_id from public.offering_sessions sessions join published using (version_id)
    where (p_kind = 'session_code' and sessions.academic_period_code = p_value)
       or (p_kind = 'session_name' and sessions.academic_period_name = p_value)
  ) select coalesce(jsonb_agg(version_id order by version_id), '[]'::jsonb) from matches;
$$;
revoke all on function public.published_course_directory_page(integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.published_course_directory_page(integer, integer, integer) to anon, authenticated, service_role;
revoke all on function public.published_course_filter_versions(integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.published_course_filter_versions(integer, text, text) to anon, authenticated, service_role;
