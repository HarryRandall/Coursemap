begin;
\ir ../helpers/catalogue-fixtures.inc
select extensions.plan(10);
select pg_temp.publish_course('COMP1100', 2026::smallint, 'Programming as Problem Solving', 'fixed', 6);
insert into public.academic_periods (
  calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status
) values (2026, 'S1', 'Semester 1', 'S1', '2026-02-23', '2026-05-29', 1, 'published')
on conflict (calendar_year, code) do nothing;
select extensions.ok(not has_function_privilege('anon','public.save_current_user_academic_result(uuid,text,numeric,text,numeric)','execute'),'anonymous users cannot edit results');
insert into auth.users (instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','96000000-0000-4000-8000-000000000001','authenticated','authenticated','academic-edit@example.test','{}','{}',now(),now());
insert into public.plans(owner_id,academic_year_id,name,is_primary,commencement_year,study_load) values ('96000000-0000-4000-8000-000000000001',(select id from public.academic_years where year=2026),'Academic test',true,2026,'full_time');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.add_current_user_plan_item('COMP1100',2026::smallint,2026::smallint,'S1');
select extensions.lives_ok($$select public.save_current_user_academic_result((select id from public.plan_items where owner_id=auth.uid()),'save',0,'NCN',6)$$,'record NCN from a plan item');
select extensions.ok((select mark=0 and grade='NCN' and status='failed' and units_earned=0 from public.course_attempts where owner_id=auth.uid()),'NCN stores mark, grade and failed status');
select extensions.lives_ok($$select public.save_current_user_academic_result((select id from public.course_attempts where owner_id=auth.uid()),'save',80,null)$$,'edit an existing result');
select extensions.ok((select mark=80 and grade is null and status='completed' and units_earned=6 from public.course_attempts where owner_id=auth.uid()),'editing refreshes earned units');
select public.save_current_user_academic_result((select id from public.course_attempts where owner_id=auth.uid()),'save',null,'PS');
select extensions.ok((select mark=50 and grade='PS' from public.course_attempts where owner_id=auth.uid()),'PS is exactly 50');
select extensions.throws_ok($$select public.save_current_user_academic_result((select id from public.course_attempts where owner_id=auth.uid()),'save',101,null)$$,'22023','The mark must be between 0 and 100 with up to two decimal places.','invalid marks are rejected');
select public.save_current_user_academic_result((select id from public.course_attempts where owner_id=auth.uid()),'clear');
select extensions.ok((select mark is null and grade is null and status='enrolled' and units_earned=0 from public.course_attempts where owner_id=auth.uid()),'clear preserves the attempt and removes its result');
select set_config('test.result_id',(select id::text from public.course_attempts where owner_id=auth.uid()),true);
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select extensions.throws_ok($$select public.save_current_user_academic_result(current_setting('test.result_id')::uuid,'clear')$$,'42501','The result was not found.','another owner cannot clear a result');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select public.save_current_user_academic_result((select id from public.course_attempts where owner_id=auth.uid()),'remove');
select extensions.is((select count(*) from public.course_attempts where owner_id=auth.uid()),0::bigint,'remove deletes the owned attempt');
select * from extensions.finish();
rollback;
