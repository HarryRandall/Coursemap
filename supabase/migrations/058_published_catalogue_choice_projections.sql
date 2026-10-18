-- The publication pointer bounds both projections, independent of caller roles.
create function public.published_fee_reference_courses(academic_year integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with published as materialized (
    select records.published_version_id as version_id, details.academic_career,
      details.college, details.subject_code, details.units
    from public.catalogue_records as records
    join public.academic_years as years on years.id = records.academic_year_id
    join public.course_version_details as details on details.version_id = records.published_version_id
    where records.kind = 'course' and records.archived_at is null and years.year = academic_year
  ), latest_fees as (
    select distinct on (fees.version_id, fees.audience)
      fees.version_id, fees.audience, fees.amount, fees.basis
    from published join public.course_fees as fees on fees.version_id = published.version_id
    where fees.audience in ('domestic', 'international') and fees.amount is not null
    order by fees.version_id, fees.audience, coalesce(fees.fee_year, 0) desc, fees.id
  ), fee_lists as (
    select version_id, jsonb_agg(jsonb_build_object(
      'audience', audience, 'amount', amount, 'basis', basis
    ) order by audience) as fees from latest_fees group by version_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'academicCareer', published.academic_career, 'college', published.college,
    'subject', published.subject_code, 'units', published.units,
    'fees', coalesce(fee_lists.fees, '[]'::jsonb)
  ) order by published.version_id), '[]'::jsonb) from published left join fee_lists on fee_lists.version_id = published.version_id;
$$;
comment on function public.published_fee_reference_courses(integer) is
  'Latest non-null domestic and international fees for live published courses in one catalogue year.';
revoke all on function public.published_fee_reference_courses(integer) from public, anon, authenticated, service_role;
grant execute on function public.published_fee_reference_courses(integer) to anon, authenticated, service_role;

create function public.published_onboarding_catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
  with published as materialized (
    select records.published_version_id as version_id, records.academic_year_id,
      codes.kind, codes.code, years.year, details.name, details.description, details.duration_years, details.units
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    join public.academic_years as years on years.id = records.academic_year_id
    join public.structure_version_details as details on details.version_id = records.published_version_id
    where records.kind <> 'course' and records.archived_at is null
  ), selectable as materialized (
    select published.version_id, relationships.target_kind as kind, upper(relationships.target_code) as code
    from published join public.academic_structure_snapshot_relationships as relationships on relationships.version_id = published.version_id
    where published.kind = 'programme' and relationships.relationship_kind = 'option'
      and relationships.target_kind in ('major', 'minor', 'specialisation')
    union
    select published.version_id, conditions.structure_kind as kind, upper(options.code) as code
    from published join public.requirement_conditions as conditions on conditions.version_id = published.version_id
    join public.requirement_condition_options as options on options.condition_id = conditions.id
      and options.version_id = conditions.version_id and options.kind = conditions.structure_kind
    where published.kind = 'programme' and conditions.condition_kind = 'structure_set'
      and conditions.structure_kind in ('major', 'minor', 'specialisation')
  ), selectable_lists as (
    select version_id,
      jsonb_agg(code order by code collate "C") filter (where kind = 'major') as majors,
      jsonb_agg(code order by code collate "C") filter (where kind = 'minor') as minors,
      jsonb_agg(code order by code collate "C") filter (where kind = 'specialisation') as specialisations
    from selectable group by version_id
  ), choices as (
    select published.kind, published.version_id, jsonb_build_object(
      'catalogueYear', published.year, 'code', published.code, 'description', coalesce(published.description, ''),
      'durationYears', published.duration_years, 'name', published.name, 'units', published.units,
      'majorCodes', coalesce(selectable_lists.majors, '[]'::jsonb),
      'minorCodes', coalesce(selectable_lists.minors, '[]'::jsonb),
      'specialisationCodes', coalesce(selectable_lists.specialisations, '[]'::jsonb)
    ) as choice from published left join selectable_lists on selectable_lists.version_id = published.version_id
  )
  select jsonb_build_object(
    'catalogueYears', coalesce((select jsonb_agg(jsonb_build_object('id', academic_year_id, 'year', year) order by year desc) from (select distinct academic_year_id, year from published where kind = 'programme') as years), '[]'::jsonb),
    'degrees', coalesce((select jsonb_agg(choice order by version_id) from choices where kind = 'programme'), '[]'::jsonb),
    'majors', coalesce((select jsonb_agg(choice order by version_id) from choices where kind = 'major'), '[]'::jsonb),
    'minors', coalesce((select jsonb_agg(choice order by version_id) from choices where kind = 'minor'), '[]'::jsonb),
    'specialisations', coalesce((select jsonb_agg(choice order by version_id) from choices where kind = 'specialisation'), '[]'::jsonb)
  );
$$;
comment on function public.published_onboarding_catalogue() is
  'Student choices across all live published catalogue years, including only explicit selectable programme rules.';
revoke all on function public.published_onboarding_catalogue() from public, anon, authenticated, service_role;
grant execute on function public.published_onboarding_catalogue() to anon, authenticated, service_role;
