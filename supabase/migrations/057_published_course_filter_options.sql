-- Return the small set of filter labels without shipping every course edition
-- and its names through hundreds of gateway requests.
create function public.published_course_filter_options() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with published as materialized (
    select records.id as record_id, versions.id as version_id, codes.code,
      years.year, details.subject_code, details.subject_name, details.units,
      details.delivery_summary, details.college
    from public.catalogue_records as records
    join public.catalogue_versions as versions on versions.id = records.published_version_id
    join public.catalogue_codes as codes on codes.id = records.code_id
    join public.academic_years as years on years.id = records.academic_year_id
    join public.course_version_details as details on details.version_id = versions.id
    where records.kind = 'course' and records.archived_at is null
  ), subjects as (
    select distinct on (subject_code) subject_code, subject_name
    from published
    where subject_code is not null and subject_code <> ''
    order by subject_code, code, year desc
  )
  select jsonb_build_object(
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('code', subject_code, 'name', subject_name) order by subject_code) from subjects), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(year order by year desc) from (select distinct year from published) as choices), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(units order by units) from (select distinct units from published where units is not null) as choices), '[]'::jsonb),
    'modes', coalesce((select jsonb_agg(delivery_summary order by delivery_summary) from (select distinct delivery_summary from published where delivery_summary is not null and delivery_summary <> '') as choices), '[]'::jsonb),
    'colleges', coalesce((select jsonb_agg(college order by college) from (select distinct college from published where college is not null and college <> '') as choices), '[]'::jsonb),
    'areas', coalesce((select jsonb_agg(name order by name) from (select distinct names.name from published join public.course_areas_of_interest as names on names.version_id = published.version_id) as choices), '[]'::jsonb),
    'tags', coalesce((select jsonb_agg(name order by name) from (select distinct names.name from published join public.course_tags as names on names.version_id = published.version_id) as choices), '[]'::jsonb)
  );
$$;

comment on function public.published_course_filter_options() is
  'Directory filter labels from live published course versions only, across all catalogue years.';
revoke all on function public.published_course_filter_options() from public, anon, authenticated, service_role;
grant execute on function public.published_course_filter_options() to anon, authenticated, service_role;
