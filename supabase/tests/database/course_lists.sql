-- Course lists: drafts stay private, publication exposes membership as tags.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

insert into public.academic_years (year) values (2026) on conflict (year) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'list-student@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'list-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '12000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select extensions.throws_ok(
  $$ select public.save_course_list(null, 2026, 'List A', null, array['TSTL1001']) $$,
  '42501', null, 'a student cannot create a course list'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

create temporary table list_fixture as
select public.save_course_list(
  null, 2026, 'List A', 'https://example.edu/list-a',
  array['tstl1001', 'TSTL1002', ' TSTL1002 ', '']
) as id;

select extensions.results_eq(
  $$ select code from public.course_list_members
     where list_id = (select id from list_fixture) and state = 'draft' order by code $$,
  $$ values ('TSTL1001'), ('TSTL1002') $$,
  'draft membership is normalised and distinct'
);

select extensions.is_empty(
  $$ select * from public.published_course_list_tags(array[2026], array['TSTL1001']) $$,
  'an unpublished list tags nothing'
);

select public.publish_course_list((select id from list_fixture));

select extensions.results_eq(
  $$ select course_code, tag from public.published_course_list_tags(
       array[2026], array['TSTL1001', 'TSTL1002', 'TSTL1003']) $$,
  $$ values ('TSTL1001', 'List A'), ('TSTL1002', 'List A') $$,
  'publication tags each member course'
);

select public.save_course_list(
  (select id from list_fixture), 2026, 'List A', null, array['TSTL1003']
);

select extensions.results_eq(
  $$ select course_code from public.published_course_list_tags(
       array[2026], array['TSTL1001', 'TSTL1003']) $$,
  $$ values ('TSTL1001') $$,
  'a new draft does not change published membership'
);

select extensions.throws_ok(
  $$ select public.save_course_list(null, 2026, 'list a', null, array[]::text[]) $$,
  '23505', null, 'a list name is unique in its year whatever its case'
);

select extensions.throws_ok(
  $$ select public.save_course_list(null, 2026, 'List B', null, array['NOT A CODE']) $$,
  '23514', null, 'members must be course codes'
);

select extensions.throws_ok(
  $$ select public.save_course_list(null, 2026, 'List C', 'http://example.edu', array[]::text[]) $$,
  '23514', null, 'a source link must use HTTPS'
);

reset role;
set local role anon;

select extensions.ok(
  not has_table_privilege('anon', 'public.course_list_members', 'select')
  and (select count(*) from public.published_course_list_tags(array[2026], array['TSTL1001'])) = 1,
  'anonymous readers see published tags but not the list tables'
);

select * from extensions.finish();
rollback;
