begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

insert into auth.users (id, email)
values ('4d2c9e71-6b3a-4f85-9c1e-7a2b8d5f3e60', 'calendar-reviewer@example.test');

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '4d2c9e71-6b3a-4f85-9c1e-7a2b8d5f3e60';

insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles
cross join private.app_permissions as permissions
where roles.key = 'admin' and permissions.key = 'imports.manage'
on conflict do nothing;

create temporary table staged (id uuid) on commit drop;
grant all on staged to authenticated;

select set_config('request.jwt.claim.sub', '4d2c9e71-6b3a-4f85-9c1e-7a2b8d5f3e60', true);
set local role authenticated;

insert into staged
select public.stage_university_calendar_review(
  2195,
  'test-parser',
  '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}'::jsonb,
  jsonb_build_object(
    'externalKey', 'university-calendar-2195',
    'canonicalUrl', 'https://calendar.example.test/?year=2195',
    'fetchedAt', '2195-01-01T00:00:00Z',
    'contentSha256', repeat('f', 64)
  ),
  '[
    {"date":"2195-02-20","title":"Semester 1 begins"},
    {"date":"2195-03-31","title":"Census dat"},
    {"date":"2195-12-25","title":"Stray row"}
  ]'::jsonb,
  '[]'::jsonb
);

select extensions.throws_ok(
  $$ select public.revise_university_calendar_review((select id from staged), '2195-03-31', 'Census dat', '2194-03-31', 'Census date') $$,
  '22023',
  'Choose a date in 2195.',
  'a correction must stay in the calendar year'
);

select extensions.throws_ok(
  $$ select public.revise_university_calendar_review((select id from staged), '2195-04-01', 'Not in the sync', '2195-04-01', 'Anything') $$,
  'P0002',
  'That date is no longer part of this sync.',
  'only dates in the sync can be revised'
);

select extensions.lives_ok(
  $$ select public.revise_university_calendar_review((select id from staged), '2195-03-31', 'Census dat', '2195-03-31', ' Census date ') $$,
  'a staged date can be corrected'
);

select extensions.lives_ok(
  $$ select public.revise_university_calendar_review((select id from staged), '2195-12-25', 'Stray row') $$,
  'a staged date can be left out'
);

select extensions.is(
  (select events from public.university_calendar_reviews where id = (select id from staged)),
  '[
    {"date":"2195-02-20","title":"Semester 1 begins"},
    {"date":"2195-03-31","title":"Census date","manual":true}
  ]'::jsonb,
  'the sync keeps its order, marks the correction manual and drops the left-out date'
);

select extensions.lives_ok(
  $$ select public.approve_university_calendar_review((select id from staged)) $$,
  'the revised sync can be approved'
);

reset role;

select extensions.results_eq(
  $$
    select title, origin
    from public.university_calendar_events
    where calendar_year = 2195 and status = 'published'
    order by event_date
  $$,
  $$ values ('Semester 1 begins', 'anu'), ('Census date', 'manual') $$,
  'a date corrected during review is published as manual'
);

select * from extensions.finish();
rollback;
