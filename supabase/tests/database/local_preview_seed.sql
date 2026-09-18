begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

select extensions.is(
  (
    select count(*)
    from public.academic_years
    where year between 2020 and 2030
      and is_import_enabled
  ),
  11::bigint,
  'all agreed import years are selectable'
);

select extensions.ok(
  exists (
    select 1
    from public.academic_years
    where year = 2026
      and source_availability = 'available'
      and directory_refreshed_at is not null
      and availability_note = 'Local preview fixture'
  ),
  'the local preview marks only its fetched directory as available'
);

select extensions.ok(
  exists (
    select 1
    from public.profiles as profiles
    join private.user_roles as user_roles
      on user_roles.user_id = profiles.id
    join private.app_roles as roles on roles.id = user_roles.role_id
    where lower(profiles.email) = 'test@test.com'
      and roles.key = 'admin'
  ),
  'the local preview account exists with the admin role'
);

select extensions.is(
  (
    select count(*)
    from public.university_calendar_events
    where calendar_year = 2026
      and status = 'published'
  ),
  16::bigint,
  'the local preview retains the published university calendar fixture'
);

select extensions.is(
  (
    select count(*)
    from public.academic_periods
    where calendar_year between 2026 and 2028
      and code in ('S1', 'S2')
      and status = 'published'
  ),
  6::bigint,
  'the local preview retains three years of semester planning periods'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_item_years
    where academic_year_id = (
      select id from public.academic_years where year = 2026
    )
      and kind = 'course'
      and published_snapshot_id is not null
  ),
  2::bigint,
  'only the two explicitly imported preview courses have published snapshots'
);

select extensions.ok(
  exists (
    select 1
    from public.catalogue_items
    where kind = 'course' and code = 'MATH1005'
  )
  and not exists (
    select 1
    from public.catalogue_item_years
    join public.catalogue_items as items on items.id = catalogue_item_years.item_id
    where items.code = 'MATH1005'
  ),
  'the prerequisite has an identity without invented imported content'
);

select extensions.ok(
  public.published_course_detail('COMP1110', 2026::smallint)
    ->'snapshot'->>'title'
    = 'Structured Programming'
  and jsonb_array_length(
    public.published_course_detail('COMP1110', 2026::smallint)->'fees'
  ) = 1
  and jsonb_array_length(
    public.published_course_detail('COMP1110', 2026::smallint)
      ->'offeringSessions'
  ) = 1
  and jsonb_array_length(
    public.published_course_detail('COMP1110', 2026::smallint)
      ->'assessmentItems'
  ) = 1,
  'explicit-year detail exposes the rich relational snapshot'
);

select extensions.ok(
  exists (
    select 1
    from public.published_requirement_graph('COMP1110', 2026::smallint)
    where from_code = 'MATH1005'
      and to_code = 'COMP1110'
      and not from_is_available
      and to_is_available
  ),
  'the prerequisite graph reports a referenced placeholder as unavailable'
);

set local role anon;

select extensions.is(
  (
    select count(*)
    from public.catalogue_items
    where code in ('COMP1100', 'COMP1110', 'MATH1005')
  ),
  3::bigint,
  'anonymous readers can see published identities and prerequisite placeholders'
);

reset role;

select extensions.ok(
  (select count(*) from public.plans) = 0
  and (
    select count(*)
    from public.catalogue_item_years
    where kind <> 'course' and published_snapshot_id is not null
  ) = 5,
  'the preview keeps plans empty while publishing every selectable structure fixture'
);

select extensions.ok(
  not exists (
    select 1 from public.course_snapshot_details as details
    join public.course_unit_options as options on options.snapshot_id = details.snapshot_id
    where details.unit_value_kind = 'fixed'
  ),
  'fixed-unit preview courses have no variable unit options'
);

select * from extensions.finish();

rollback;
