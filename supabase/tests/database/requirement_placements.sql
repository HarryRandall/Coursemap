begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.set_current_user_requirement_placement(text,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_current_user_requirement_placement(text,text,text)',
    'execute'
  )
  and exists (
    select 1
    from pg_proc as functions
    where functions.oid =
      'public.set_current_user_requirement_placement(text,text,text)'::regprocedure
      and not functions.prosecdef
      and functions.proconfig @> array['search_path=""']::text[]
  ),
  'the placement RPC is security invoker, has a fixed search path and is for signed-in users only'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '98000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'placement-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '98000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'placement-other@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.plans (
  owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
select users.id, (select id from public.academic_years where year = 2026),
  'Placement plan', true, 2026, 'full_time'
from auth.users as users
where users.id in (
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002'
);

set local role anon;

select extensions.throws_ok(
  $$ select public.set_current_user_requirement_placement('COMP1100', 'AACOM', 'electives') $$,
  '42501',
  null,
  'anonymous visitors cannot place a course'
);

reset role;

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$ select public.set_current_user_requirement_placement(' comp1100 ', 'aacom', ' electives ') $$,
  'a student places a course in their primary plan'
);

select extensions.results_eq(
  $$
    select course_code, structure_code, requirement_key
    from public.plan_requirement_placements
  $$,
  $$ values ('COMP1100'::text, 'AACOM'::text, 'electives'::text) $$,
  'the placement is stored normalised against the caller''s plan'
);

select public.set_current_user_requirement_placement('COMP1100', 'AACOM', 'computing-list');

select extensions.results_eq(
  $$ select count(*)::int, min(requirement_key) from public.plan_requirement_placements $$,
  $$ values (1, 'computing-list'::text) $$,
  'placing a course again moves it rather than adding a second placement'
);

select extensions.throws_ok(
  $$
    insert into public.plan_requirement_placements (
      plan_id, owner_id, course_code, structure_code, requirement_key
    )
    select plans.id, '98000000-0000-4000-8000-000000000002', 'COMP1110', 'AACOM', 'electives'
    from public.plans
    where plans.owner_id = '98000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a student cannot write a placement under another owner'
);

select extensions.throws_ok(
  $$ select public.set_current_user_requirement_placement('Not a code', 'AACOM', 'electives') $$,
  '23514',
  null,
  'placements name a course code'
);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);

select extensions.is_empty(
  $$ select 1 from public.plan_requirement_placements $$,
  'a student cannot see another student''s placements'
);

select public.set_current_user_requirement_placement('COMP1100', 'AACOM', null);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);

select extensions.results_eq(
  $$ select count(*)::int from public.plan_requirement_placements $$,
  $$ values (1) $$,
  'clearing a placement touches only the caller''s own plan'
);

select public.set_current_user_requirement_placement('COMP1100', 'AACOM', null);

select extensions.is_empty(
  $$ select 1 from public.plan_requirement_placements $$,
  'clearing a placement hands the course back to Coursemap'
);

reset role;

-- Degree-wide scope and open lists belong to the requirement tree.
select pg_temp.create_course_snapshot('SCOP1000', 2029::smallint, 'Scope fixture');

create temporary table fixture on commit drop as
select snapshots.id as version_id, snapshots.academic_year_id
from public.catalogue_versions as snapshots
join public.course_version_details as details on details.version_id = snapshots.id
where details.title = 'Scope fixture';

insert into public.requirement_rules (version_id, academic_year_id, rule_kind, source_text)
select version_id, academic_year_id, 'prerequisite', 'Scope fixture rule.' from fixture;

insert into public.requirement_groups (rule_id, version_id, group_key, operator)
select rules.id, rules.version_id, 'root', 'all_of'
from public.requirement_rules as rules join fixture on fixture.version_id = rules.version_id;

select extensions.throws_ok(
  $$
    insert into public.requirement_conditions (
      rule_id, version_id, group_id, condition_key, position, condition_kind,
      minimum_units, includes_any_course
    )
    select groups.rule_id, groups.version_id, groups.id, 'open-total', 0, 'units_total', 24, true
    from public.requirement_groups as groups join fixture on fixture.version_id = groups.version_id
  $$,
  '23514',
  null,
  'only course lists can be open to any course'
);

select * from extensions.finish();

rollback;
