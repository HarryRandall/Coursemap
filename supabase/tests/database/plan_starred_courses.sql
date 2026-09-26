begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.set_current_user_course_star(text,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_current_user_course_star(text,boolean)',
    'execute'
  )
  and exists (
    select 1
    from pg_proc as functions
    where functions.oid =
      'public.set_current_user_course_star(text,boolean)'::regprocedure
      and not functions.prosecdef
      and functions.proconfig @> array['search_path=""']::text[]
  ),
  'the star RPC is security invoker, has a fixed search path and is for signed-in users only'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '99000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'star-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '99000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'star-other@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.plans (
  owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
select users.id, (select id from public.academic_years where year = 2026),
  'Star plan', true, 2026, 'full_time'
from auth.users as users
where users.id in (
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000002'
);

set local role anon;

select extensions.throws_ok(
  $$ select public.set_current_user_course_star('COMP1100', true) $$,
  '42501',
  null,
  'anonymous visitors cannot star a course'
);

reset role;

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$ select public.set_current_user_course_star(' comp1100 ', true) $$,
  'a student stars a course in their primary plan'
);

select public.set_current_user_course_star('COMP1100', true);

select extensions.results_eq(
  $$ select course_code from public.plan_starred_courses $$,
  $$ values ('COMP1100'::text) $$,
  'the star is stored once, normalised against the caller''s plan'
);

select extensions.throws_ok(
  $$
    insert into public.plan_starred_courses (plan_id, owner_id, course_code)
    select plans.id, '99000000-0000-4000-8000-000000000002', 'COMP1110'
    from public.plans
    where plans.owner_id = '99000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'a student cannot write a star under another owner'
);

select extensions.throws_ok(
  $$ select public.set_current_user_course_star('Not a code', true) $$,
  '23514',
  null,
  'stars name a course code'
);

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);

select extensions.is_empty(
  $$ select 1 from public.plan_starred_courses $$,
  'a student cannot see another student''s stars'
);

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select public.set_current_user_course_star('COMP1100', false);

select extensions.is_empty(
  $$ select 1 from public.plan_starred_courses $$,
  'unstarring removes the course'
);

select * from extensions.finish();

rollback;
