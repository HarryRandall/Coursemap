begin;
\ir ../helpers/catalogue-review.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

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
insert into public.course_source_pages (
  source_id, academic_year_id, page_kind, external_key, canonical_url,
  media_type, content_sha256, http_status, byte_size
)
select
  sources.id,
  years.id,
  'course_page',
  'COMP1110',
  'https://coursemap.local.test/2030/comp1110',
  'text/html',
  repeat('8', 64),
  200,
  512
from public.course_sources as sources
join public.academic_years as years on years.year = 2030
where sources.kind = 'local_mock';

insert into public.course_years (course_id, academic_year_id)
select courses.id, years.id
from public.courses
join public.academic_years as years on years.year = 2030
where courses.code = 'COMP1110';

insert into public.course_snapshots (
  course_year_id, academic_year_id, snapshot_number, origin,
  source_page_id, projection_sha256, validation_status,
  has_critical_uncertainty, title, unit_value_kind, units, level,
  subject_code, academic_career, offering_status,
  created_by
)
select
  course_years.id,
  years.id,
  1,
  'import',
  documents.id,
  repeat('8', 64),
  'valid',
  false,
  'Structured Programming 2030',
  'fixed',
  6,
  1000,
  'COMP',
  'UGRD',
  'unknown',
  '94000000-0000-4000-8000-000000000001'
from public.course_years
join public.courses on courses.id = course_years.course_id
join public.academic_years as years
  on years.id = course_years.academic_year_id
join public.course_source_pages as documents
  on documents.academic_year_id = years.id
 and documents.external_key = courses.code
where courses.code = 'COMP1110'
  and years.year = 2030;

select pg_temp.approve_catalogue_fixture('course', snapshots.id)
from public.course_snapshots as snapshots
join public.courses on true
join public.academic_years as years on years.id = snapshots.academic_year_id
cross join public.course_years as course_years
where snapshots.course_year_id = course_years.id
  and courses.id = course_years.course_id
  and courses.code = 'COMP1110'
  and years.year = 2030;

update public.course_years
set published_snapshot_id = snapshots.id
from public.course_snapshots as snapshots
join public.courses on true
join public.academic_years as years on years.id = snapshots.academic_year_id
where snapshots.course_year_id = course_years.id
  and courses.id = course_years.course_id
  and courses.code = 'COMP1110'
  and years.year = 2030;

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
      plan_id, owner_id, course_id, academic_year_id
    ) values (
      (select id from public.plans where name = 'Planner hardening plan'),
      '94000000-0000-4000-8000-000000000001',
      (select id from public.courses where code = 'COMP1100'),
      (select id from public.academic_years where year = 2026)
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
    join public.courses on courses.id = plan_items.course_id
    join public.academic_years on academic_years.id = plan_items.academic_year_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = plan_items.course_id
    join public.academic_years on academic_years.id = plan_items.academic_year_id
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
        join public.courses on courses.id = plan_items.course_id
        where plan_items.owner_id = (select auth.uid())
          and courses.code = 'COMP1110'
      ),
      2027::smallint,
      'S1',
      null
    )
  $$,
  '22023',
  'A planned course cannot be moved outside its selected academic year.',
  'moving a plan item cannot silently change its selected course year'
);

select extensions.throws_ok(
  $$
    select public.record_current_user_course_attempt(
      (
        select plan_items.id
        from public.plan_items
        join public.courses on courses.id = plan_items.course_id
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
    join public.courses on courses.id = plan_items.course_id
    where plan_items.owner_id = (select auth.uid())
      and courses.code = 'COMP1110'
  )
  and not exists (
    select 1
    from public.course_attempts
    join public.courses on courses.id = course_attempts.course_id
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
        join public.courses on courses.id = plan_items.course_id
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
    join public.course_snapshots
      on course_snapshots.id = course_attempts.course_snapshot_id
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
      owner_id, course_id, course_snapshot_id, academic_period_id,
      status, mark, units_attempted, units_earned, source
    )
    select
      owner_id, course_id, course_snapshot_id, academic_period_id,
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
  course_attempts.course_snapshot_id,
  course_attempts.units_attempted
from public.course_attempts
join public.courses on courses.id = course_attempts.course_id
where course_attempts.owner_id = '94000000-0000-4000-8000-000000000001'
  and courses.code = 'COMP1100';

update public.course_attempts
set grade = 'HD'
where id = (select id from first_attempt_state);

insert into public.course_snapshots (
  course_year_id, academic_year_id, snapshot_number, origin,
  based_on_snapshot_id, source_page_id, projection_sha256,
  schema_version, validation_status, overall_confidence,
  has_critical_uncertainty, title, unit_value_kind, units,
  minimum_units, maximum_units, eftsl, level, subject_code, subject_name,
  school, college, academic_career, convener_text, delivery_summary,
  introduction, description, workload_text, workload_hours,
  inherent_requirements, prescribed_texts, offering_status,
  source_updated_at, created_by
)
select
  snapshots.course_year_id,
  snapshots.academic_year_id,
  snapshots.snapshot_number + 1,
  'manual_edit',
  snapshots.id,
  snapshots.source_page_id,
  repeat('9', 64),
  snapshots.schema_version,
  'valid',
  snapshots.overall_confidence,
  false,
  'Programming as Problem Solving, revised',
  'fixed',
  12,
  null,
  null,
  snapshots.eftsl,
  snapshots.level,
  snapshots.subject_code,
  snapshots.subject_name,
  snapshots.school,
  snapshots.college,
  snapshots.academic_career,
  snapshots.convener_text,
  snapshots.delivery_summary,
  snapshots.introduction,
  'A later published snapshot with revised units.',
  snapshots.workload_text,
  snapshots.workload_hours,
  snapshots.inherent_requirements,
  snapshots.prescribed_texts,
  snapshots.offering_status,
  snapshots.source_updated_at,
  '94000000-0000-4000-8000-000000000001'
from public.course_snapshots as snapshots
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
join public.academic_years on academic_years.id = snapshots.academic_year_id
where courses.code = 'COMP1100'
  and academic_years.year = 2026
  and snapshots.id = course_years.published_snapshot_id;

create temporary table later_snapshot as
select
  snapshots.id as snapshot_id,
  snapshots.course_year_id,
  course_years.published_snapshot_id as previous_published_snapshot_id
from public.course_snapshots as snapshots
join public.course_years on course_years.id = snapshots.course_year_id
join public.courses on courses.id = course_years.course_id
join public.academic_years on academic_years.id = snapshots.academic_year_id
where courses.code = 'COMP1100'
  and academic_years.year = 2026
  and snapshots.title = 'Programming as Problem Solving, revised';

grant select on table first_attempt_state, later_snapshot to authenticated;

select pg_temp.approve_catalogue_fixture('course', later_snapshot.snapshot_id)
from later_snapshot
cross join public.course_years as course_years
where course_years.id = later_snapshot.course_year_id;

update public.course_years
set published_snapshot_id = later_snapshot.snapshot_id
from later_snapshot
where course_years.id = later_snapshot.course_year_id;

set local role authenticated;

select extensions.ok(
  exists (
    select 1
    from public.course_years
    join later_snapshot on later_snapshot.course_year_id = course_years.id
    where course_years.published_snapshot_id = later_snapshot.snapshot_id
      and later_snapshot.snapshot_id <> later_snapshot.previous_published_snapshot_id
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
        join public.courses on courses.id = plan_items.course_id
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
      and course_attempts.course_snapshot_id = first_attempt_state.course_snapshot_id
      and course_attempts.course_snapshot_id <> later_snapshot.snapshot_id
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
