begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

select extensions.ok(
  has_function_privilege('authenticated', 'public.save_current_user_primary_plan_with_enrolment_mode(text,text,smallint,smallint,text,text,text,text[],text[],text)', 'execute')
  and not has_function_privilege('anon', 'public.save_current_user_primary_plan_with_enrolment_mode(text,text,smallint,smallint,text,text,text,text[],text[],text)', 'execute'),
  'only authenticated plan saves can set enrolment context'
);

select extensions.ok(
  (select not prosecdef and proconfig @> array['search_path=""']::text[]
   from pg_proc where oid = 'public.save_current_user_primary_plan_with_enrolment_mode(text,text,smallint,smallint,text,text,text,text[],text[],text)'::regprocedure),
  'the enrolment context RPC retains invoker permissions and a fixed search path'
);

insert into auth.users (instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','97000000-0000-4000-8000-000000000081','authenticated','authenticated','enrolment-context@example.test','{"provider":"email","providers":["email"]}','{}',now(),now());

select pg_temp.publish_snapshot(pg_temp.create_structure_snapshot('programme','ENRL-PROG',2026::smallint,'Enrolment context programme',144,3));
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000081',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select extensions.lives_ok(
  $$ select public.save_current_user_primary_plan_with_enrolment_mode('Context student','u1234567',2026::smallint,2024::smallint,'full_time','ENRL-PROG',p_enrolment_mode => 'flexible_double_degree') $$,
  'student profile and explicit degree mode save together'
);
select extensions.is((select enrolment_mode from public.plans where is_primary),'flexible_double_degree','the student degree mode is durable');

select extensions.throws_ok(
  $$ select public.save_current_user_primary_plan_with_enrolment_mode('Invalid overwrite','u1234567',2026::smallint,2024::smallint,'full_time','ENRL-PROG',p_enrolment_mode => 'double') $$,
  '22023', null, 'invalid degree modes fail before changing the profile'
);
select extensions.is((select display_name from public.profiles where id = auth.uid()),'Context student','an invalid mode cannot partially save the profile');

select extensions.lives_ok(
  $$ select public.save_current_user_primary_plan('Context student','u1234567',2026::smallint,2024::smallint,'part_time','ENRL-PROG') $$,
  'older clients can still save the existing plan contract'
);
select extensions.is((select enrolment_mode from public.plans where is_primary),'flexible_double_degree','older client saves preserve the explicit context');

select extensions.lives_ok(
  $$ select public.save_current_user_primary_plan_with_enrolment_mode('Context student','u1234567',2026::smallint,2024::smallint,'part_time','ENRL-PROG',p_enrolment_mode => null) $$,
  'students can explicitly clear uncertain degree context'
);
select extensions.is((select enrolment_mode from public.plans where is_primary),null::text,'missing context remains unknown rather than defaulting to single degree');

select * from extensions.finish();
rollback;
