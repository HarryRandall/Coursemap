begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(24);
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '97000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'override-owner@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '97000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'override-other@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.plans (
  owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
select users.id, (select id from public.academic_years where year = 2026),
  'Override plan', true, 2026, 'full_time'
from auth.users as users
where users.id in (
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000002'
);


set local role anon;
select extensions.throws_ok($$ select * from public.plan_course_overrides $$, '42501', null, 'anonymous cannot read plan_course_overrides');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$
 insert into public.plan_course_overrides(plan_id, owner_id, course_code, reason)
 select id, owner_id, 'COMP1100', 'approval' from public.plans where owner_id = '97000000-0000-4000-8000-000000000001'
$$, 'owner can insert plan_course_overrides');
select extensions.results_eq($$ select count(*)::int from public.plan_course_overrides $$, $$ values(1) $$, 'owner can read plan_course_overrides');
select extensions.lives_ok($$ update public.plan_course_overrides set reason = 'credit', note = 'Approved' $$, 'owner can update plan_course_overrides');
select extensions.throws_ok($$ update public.plan_course_overrides set note = repeat('a',501) $$, '23514', null, 'notes are limited to 500 characters');
select extensions.throws_ok($$ update public.plan_course_overrides set reason = 'invalid' $$, '23514', null, 'reason must be recognised');
select extensions.throws_ok($$
 insert into public.plan_course_overrides(plan_id, owner_id, course_code, reason)
 select id, owner_id, 'COMP1100', 'other' from public.plans where owner_id = '97000000-0000-4000-8000-000000000001'
$$, '23505', null, 'duplicate overrides are rejected');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is_empty($$ select * from public.plan_course_overrides $$, 'another owner cannot read plan_course_overrides');
update public.plan_course_overrides set reason = 'other';
delete from public.plan_course_overrides;
reset role;
select extensions.results_eq($$ select reason from public.plan_course_overrides $$, $$ values('credit'::text) $$, 'another owner cannot update or delete plan_course_overrides');
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok($$
 insert into public.plan_course_overrides(plan_id, owner_id, course_code, reason)
 values ((select id from public.plans where owner_id = '97000000-0000-4000-8000-000000000002'), '97000000-0000-4000-8000-000000000001', 'COMP1100', 'other')
$$, '42501', null, 'cannot forge another owner');
reset role;
create temporary table other_plan_plan_course_overrides as select id from public.plans where owner_id = '97000000-0000-4000-8000-000000000001';
grant select on other_plan_plan_course_overrides to authenticated;
set local role authenticated;
select extensions.throws_ok($$
 insert into public.plan_course_overrides(plan_id, owner_id, course_code, reason)
 values ((select id from other_plan_plan_course_overrides), '97000000-0000-4000-8000-000000000002', 'COMP9999', 'other')
$$, '23503', null, 'composite reference rejects another owner plan');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;
delete from public.plan_course_overrides;
select extensions.is_empty($$ select * from public.plan_course_overrides $$, 'owner can undo plan_course_overrides');
reset role;

set local role anon;
select extensions.throws_ok($$ select * from public.plan_requirement_overrides $$, '42501', null, 'anonymous cannot read plan_requirement_overrides');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select extensions.lives_ok($$
 insert into public.plan_requirement_overrides(plan_id, owner_id, structure_code, requirement_key, reason)
 select id, owner_id, 'TEST', 'electives', 'approval' from public.plans where owner_id = '97000000-0000-4000-8000-000000000001'
$$, 'owner can insert plan_requirement_overrides');
select extensions.results_eq($$ select count(*)::int from public.plan_requirement_overrides $$, $$ values(1) $$, 'owner can read plan_requirement_overrides');
select extensions.lives_ok($$ update public.plan_requirement_overrides set reason = 'credit', note = 'Approved' $$, 'owner can update plan_requirement_overrides');
select extensions.throws_ok($$ update public.plan_requirement_overrides set note = repeat('a',501) $$, '23514', null, 'notes are limited to 500 characters');
select extensions.throws_ok($$ update public.plan_requirement_overrides set reason = 'invalid' $$, '23514', null, 'reason must be recognised');
select extensions.throws_ok($$
 insert into public.plan_requirement_overrides(plan_id, owner_id, structure_code, requirement_key, reason)
 select id, owner_id, 'TEST', 'electives', 'other' from public.plans where owner_id = '97000000-0000-4000-8000-000000000001'
$$, '23505', null, 'duplicate overrides are rejected');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.is_empty($$ select * from public.plan_requirement_overrides $$, 'another owner cannot read plan_requirement_overrides');
update public.plan_requirement_overrides set reason = 'other';
delete from public.plan_requirement_overrides;
reset role;
select extensions.results_eq($$ select reason from public.plan_requirement_overrides $$, $$ values('credit'::text) $$, 'another owner cannot update or delete plan_requirement_overrides');
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select extensions.throws_ok($$
 insert into public.plan_requirement_overrides(plan_id, owner_id, structure_code, requirement_key, reason)
 values ((select id from public.plans where owner_id = '97000000-0000-4000-8000-000000000002'), '97000000-0000-4000-8000-000000000001', 'TEST', 'electives', 'other')
$$, '42501', null, 'cannot forge another owner');
reset role;
create temporary table other_plan_plan_requirement_overrides as select id from public.plans where owner_id = '97000000-0000-4000-8000-000000000001';
grant select on other_plan_plan_requirement_overrides to authenticated;
set local role authenticated;
select extensions.throws_ok($$
 insert into public.plan_requirement_overrides(plan_id, owner_id, structure_code, requirement_key, reason)
 values ((select id from other_plan_plan_requirement_overrides), '97000000-0000-4000-8000-000000000002', 'TEST', 'unused-key', 'other')
$$, '23503', null, 'composite reference rejects another owner plan');
reset role;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
set local role authenticated;
delete from public.plan_requirement_overrides;
select extensions.is_empty($$ select * from public.plan_requirement_overrides $$, 'owner can undo plan_requirement_overrides');
reset role;
select * from extensions.finish();
rollback;
