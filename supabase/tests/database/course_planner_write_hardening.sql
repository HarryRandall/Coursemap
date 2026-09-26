begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '94000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'planner-hardening@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '94000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'planner-other@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '94000000-0000-4000-8000-000000000001';

insert into public.plans (
  owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
values (
  '94000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2026),
  'Planner hardening plan',
  true,
  2026,
  'full_time'
);

-- Publish a 2030 course snapshot without inventing academic period dates. The
-- planner can place it in a synthetic S1/S2 lane while academic_period_id stays
-- null until the university calendar is imported.
select pg_temp.publish_course(
  'COMP1110', 2030::smallint, 'Structured Programming 2030', 'fixed', 6
);

select pg_temp.publish_course(
  'COMP1110', 2029::smallint, 'Structured Programming 2029', 'fixed', 6
);

select pg_temp.publish_course(
  'COMP1100', 2026::smallint, 'Programming as Problem Solving', 'fixed', 6
);

insert into public.academic_periods (
  calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status
) values (2026, 'S1', 'Semester 1', 'S1', '2026-02-23', '2026-05-29', 1, 'published')
on conflict (calendar_year, code) do nothing;

select extensions.ok(
  not has_table_privilege('authenticated', 'public.plan_items', 'insert')
  and not has_table_privilege('authenticated', 'public.plan_items', 'update')
  and not has_table_privilege('authenticated', 'public.plan_items', 'delete')
  and not has_table_privilege('authenticated', 'public.course_attempts', 'insert')
  and not has_table_privilege('authenticated', 'public.course_attempts', 'update')
  and not has_table_privilege('authenticated', 'public.course_attempts', 'delete')
  and has_function_privilege(
    'authenticated',
    'public.add_current_user_plan_item(text,smallint,smallint,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.move_current_user_plan_item(uuid,smallint,text,uuid)',
    'execute'
  ),
  'authenticated users have owner reads and RPC writes, not direct planner DML'
);

select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.throws_ok(
  $$
    insert into public.plan_items (
      plan_id, owner_id, catalogue_record_id
    ) values (
      (select id from public.plans where name = 'Planner hardening plan'),
      '94000000-0000-4000-8000-000000000001',
      (select records.id
       from public.catalogue_records as records
       join public.catalogue_codes as codes on codes.id = records.code_id
       join public.academic_years as years on years.id = records.academic_year_id
       where codes.code = 'COMP1100' and years.year = 2026)
    )
  $$,
  '42501',
  null,
  'direct authenticated plan-item inserts are denied before RLS can be bypassed'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'COMP1110', 2030::smallint, 2030::smallint, 'S1'
    )
  $$,
  'a future course can be added to a synthetic period lane'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
    join public.academic_years on academic_years.id = plan_records.academic_year_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
      and academic_years.year = 2030
      and plan_items.planned_calendar_year = 2030
      and plan_items.planned_period_code = 'S1'
      and plan_items.academic_period_id is null
  ),
  'synthetic scheduling retains the exact year and code with a null period FK'
);

select extensions.lives_ok(
  $$
    select public.move_current_user_plan_item(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1110'
      ),
      2030::smallint,
      'S2',
      null
    )
  $$,
  'a future course can move between synthetic lanes in its selected year'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
    join public.academic_years on academic_years.id = plan_records.academic_year_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
      and academic_years.year = 2030
      and plan_items.planned_calendar_year = 2030
      and plan_items.planned_period_code = 'S2'
      and plan_items.academic_period_id is null
  ),
  'a synthetic move preserves course academic year lineage'
);

select extensions.throws_ok(
  $$
    select public.move_current_user_plan_item(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1110'
      ),
      2027::smallint,
      'S1',
      null
    )
  $$,
  'P0002',
  'COMP1110 for 2027 isn''t imported yet.',
  'moving a plan item into a year without that course version is refused'
);

select extensions.lives_ok(
  $$
    select public.move_current_user_plan_item(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1110'
      ),
      2029::smallint,
      'S1',
      null
    )
  $$,
  'a planned course can move into another year that has its version imported'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
    join public.academic_years on academic_years.id = plan_records.academic_year_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
      and academic_years.year = 2029
      and plan_items.planned_calendar_year = 2029
      and plan_items.planned_period_code = 'S1'
  ),
  'moving into another year swaps the plan item to that year''s course version'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1110'
      ),
      'enrolled',
      75
    )
  $$,
  'P0002',
  'The academic period is not available for recorded history.',
  'a synthetic lane cannot become an attempt without a real academic period'
);

select extensions.ok(
  exists (
    select 1
    from public.plan_items
    join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
  )
  and not exists (
    select 1
    from public.course_attempts
    join public.catalogue_versions as attempt_versions on attempt_versions.id = course_attempts.catalogue_version_id
    join public.catalogue_records as attempt_records on attempt_records.id = attempt_versions.record_id
    join public.catalogue_codes as courses on courses.id = attempt_records.code_id
    where course_attempts.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
  ),
  'a failed synthetic attempt write leaves the plan item intact and creates no history'
);

select extensions.throws_ok(
  $$
    update public.plan_items
    set notes = 'bypass'
    where owner_id = (select auth.uid())
  $$,
  '42501',
  null,
  'direct authenticated plan-item updates are denied'
);

select extensions.throws_ok(
  $$
    delete from public.plan_items
    where owner_id = (select auth.uid())
  $$,
  '42501',
  null,
  'direct authenticated plan-item deletes are denied'
);

select extensions.throws_ok(
  $$
    select public.add_current_user_plan_item(
      'COMP1100', 2026::smallint, 2027::smallint, 'S1'
    )
  $$,
  'P0002',
  'COMP1100 for 2027 isn''t imported yet.',
  'adding a course into a year without that course version is refused'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'COMP1100', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'the planner RPC still adds a current published course after DML revocation'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1100'
      ),
      'completed',
      82
    )
  $$,
  'the attempt RPC writes and removes the plan item through its ownership guard'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join public.course_version_details as course_snapshots
      on course_snapshots.version_id = course_attempts.catalogue_version_id
    where course_attempts.owner_id = (select auth.uid())
      and course_snapshots.title = 'Programming as Problem Solving'
      and course_attempts.status = 'completed'
      and course_attempts.mark = 82
      and course_attempts.units_attempted = 6
      and course_attempts.units_earned = 6
  ),
  'the first attempt records its exact published snapshot and units'
);

select extensions.throws_ok(
  $$
    insert into public.course_attempts (
      owner_id, catalogue_version_id, academic_period_id,
      status, mark, units_attempted, units_earned, source
    )
    select
      owner_id, catalogue_version_id, academic_period_id,
      status, mark, units_attempted, units_earned, source
    from public.course_attempts
    where owner_id = (select auth.uid())
    limit 1
  $$,
  '42501',
  null,
  'direct authenticated attempt inserts are denied'
);

reset role;

create temporary table first_attempt_state as
select
  course_attempts.id,
  course_attempts.catalogue_version_id,
  course_attempts.units_attempted
from public.course_attempts
join public.catalogue_versions as attempt_versions on attempt_versions.id = course_attempts.catalogue_version_id
    join public.catalogue_records as attempt_records on attempt_records.id = attempt_versions.record_id
    join public.catalogue_codes as courses on courses.id = attempt_records.code_id
where course_attempts.owner_id = '94000000-0000-4000-8000-000000000001'
  and courses.code = 'COMP1100';

update public.course_attempts
set grade = 'HD'
where id = (select id from first_attempt_state);

create temporary table later_snapshot as
select
  pg_temp.create_course_snapshot(
    'COMP1100', 2026::smallint, 'Programming as Problem Solving, revised', 'fixed', 12
  ) as version_id,
  item_years.id as course_year_id,
  item_years.published_version_id as previous_published_version_id
from public.catalogue_records as item_years
join public.catalogue_codes as items on items.id = item_years.code_id
join public.academic_years on academic_years.id = item_years.academic_year_id
where items.code = 'COMP1100'
  and academic_years.year = 2026;

grant select on table first_attempt_state, later_snapshot to authenticated;

select pg_temp.publish_snapshot(later_snapshot.version_id) from later_snapshot;

set local role authenticated;

select extensions.ok(
  exists (
    select 1
    from public.catalogue_records as course_years
    join later_snapshot on later_snapshot.course_year_id = course_years.id
    where course_years.published_version_id = later_snapshot.version_id
      and later_snapshot.version_id <> later_snapshot.previous_published_version_id
  ),
  'a later revised snapshot can be published for the same course year'
);

select extensions.lives_ok(
  $$
    select public.add_current_user_plan_item(
      'COMP1100', 2026::smallint, 2026::smallint, 'S1'
    )
  $$,
  'the same course can be planned again after its first attempt is recorded'
);

select extensions.lives_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.catalogue_records as plan_records on plan_records.id = plan_items.catalogue_record_id
    join public.catalogue_codes as courses on courses.id = plan_records.code_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1100'
      ),
      'failed',
      45
    )
  $$,
  're-saving the same course and period updates the existing attempt'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    join first_attempt_state on first_attempt_state.id = course_attempts.id
    join later_snapshot on true
    where course_attempts.owner_id = (select auth.uid())
      and course_attempts.catalogue_version_id = first_attempt_state.catalogue_version_id
      and course_attempts.catalogue_version_id <> later_snapshot.version_id
      and course_attempts.units_attempted = first_attempt_state.units_attempted
      and course_attempts.units_attempted = 6
      and course_attempts.status = 'failed'
      and course_attempts.mark = 45
      and course_attempts.grade is null
      and course_attempts.units_earned = 0
  ),
  'attempt re-save preserves exact snapshot and units while replacing result fields'
);

select extensions.throws_ok(
  $$
    update public.course_attempts
    set mark = 99
    where owner_id = (select auth.uid())
  $$,
  '42501',
  null,
  'direct authenticated attempt updates are denied'
);

select extensions.throws_ok(
  $$
    delete from public.course_attempts
    where owner_id = (select auth.uid())
  $$,
  '42501',
  null,
  'direct authenticated attempt deletes are denied'
);

select extensions.ok(
  exists (
    select 1
    from public.course_attempts
    where owner_id = (select auth.uid())
  ),
  'the owner retains read access to attempt history'
);

select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-4000-8000-000000000002',
  true
);

select extensions.ok(
  not exists (select 1 from public.plan_items)
  and not exists (select 1 from public.course_attempts),
  'another authenticated user cannot read planner or attempt rows'
);

select * from extensions.finish();

rollback;
