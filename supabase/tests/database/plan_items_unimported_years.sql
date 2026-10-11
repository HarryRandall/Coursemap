begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

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

select pg_temp.publish_course('TEST1049', 2024::smallint);
select pg_temp.publish_course('TEST1049', 2026::smallint);
select pg_temp.publish_course('TEST1049', 2028::smallint);
select pg_temp.catalogue_item_year('course', 'TEST2049', 2026::smallint);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select extensions.lives_ok(
  $$select public.add_current_user_plan_item('TEST1049', 2026::smallint, 2027::smallint, 'S1')$$,
  'adding into an unimported year succeeds'
);
select extensions.is(
  (select years.year::integer from public.plan_items as items
   join public.catalogue_records as records on records.id = items.catalogue_record_id
   join public.academic_years as years on years.id = records.academic_year_id
   where items.owner_id = (select auth.uid())),
  2026, 'the latest earlier publication supplies the details'
);
select extensions.lives_ok(
  $$select public.move_current_user_plan_item((select id from public.plan_items where owner_id = (select auth.uid())), 2023::smallint, 'S2')$$,
  'moving before the first imported edition succeeds'
);
select extensions.ok(
  exists (select 1 from public.plan_items as items
   join public.catalogue_records as records on records.id = items.catalogue_record_id
   join public.academic_years as years on years.id = records.academic_year_id
   where items.owner_id = (select auth.uid()) and years.year = 2024
     and items.planned_calendar_year = 2023 and items.planned_period_code = 'S2'),
  'the earliest later publication preserves the chosen year and period'
);
select extensions.lives_ok(
  $$select public.move_current_user_plan_item((select id from public.plan_items where owner_id = (select auth.uid())), 2027::smallint, 'S1')$$,
  'moving into an unimported year succeeds'
);
select extensions.ok(
  exists (select 1 from public.plan_items as items
   join public.catalogue_records as records on records.id = items.catalogue_record_id
   join public.academic_years as years on years.id = records.academic_year_id
   where items.owner_id = (select auth.uid()) and years.year = 2026
     and items.planned_calendar_year = 2027 and items.planned_period_code = 'S1'),
  'moving uses the previous edition and preserves placement'
);
select extensions.throws_ok(
  $$select public.add_current_user_plan_item('TEST2049', 2026::smallint, 2027::smallint, 'S1')$$,
  'P0002', 'TEST2049 for 2027 isn''t imported yet.',
  'an unpublished course is still refused'
);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000002', true);
select extensions.is((select count(*)::integer from public.plan_items), 0, 'another owner cannot read the fallback item');
select * from extensions.finish();
rollback;
