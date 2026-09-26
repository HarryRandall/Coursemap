begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

insert into auth.users (id, email)
values
  ('7a4c1b8e-3d2f-4e6a-9b1c-5d8e2f3a4b6c', 'calendar-editor@example.test'),
  ('2e9f6d3c-8b1a-4c7e-a5d2-9f3b6e1c8d4a', 'calendar-reader@example.test');

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '7a4c1b8e-3d2f-4e6a-9b1c-5d8e2f3a4b6c';

insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles
cross join private.app_permissions as permissions
where roles.key = 'admin' and permissions.key = 'imports.manage'
on conflict do nothing;

insert into public.academic_years (year) values (2196);

insert into public.university_calendar_events (
  academic_year_id, calendar_year, event_date, title, status
)
select years.id, 2196, events.event_date, events.title, events.status
from (
  values
    ('2196-02-20'::date, 'Semester 1 begins', 'published'),
    ('2196-03-31'::date, 'Census date', 'published'),
    ('2196-04-10'::date, 'Old open day', 'archived')
) as events(event_date, title, status)
join public.academic_years as years on years.year = 2196;

create temporary table saved_ids (label text primary key, id bigint) on commit drop;
grant all on saved_ids to authenticated;

select set_config('request.jwt.claim.sub', '2e9f6d3c-8b1a-4c7e-a5d2-9f3b6e1c8d4a', true);
set local role authenticated;

select extensions.throws_ok(
  $$ select public.save_university_calendar_event(2196, '2196-05-01', 'Open day') $$,
  '42501',
  'Import management permission is required.',
  'students cannot add key dates'
);

reset role;

select set_config('request.jwt.claim.sub', '7a4c1b8e-3d2f-4e6a-9b1c-5d8e2f3a4b6c', true);
set local role authenticated;

select extensions.throws_ok(
  $$ select public.save_university_calendar_event(2196, '2195-12-31', 'Last year') $$,
  '22023',
  'Choose a date in 2196.',
  'a key date must fall in its calendar year'
);

select extensions.throws_ok(
  $$ select public.save_university_calendar_event(2196, '2196-03-31', 'Census date') $$,
  '23505',
  'That date and title are already published.',
  'a published date cannot be added twice'
);

insert into saved_ids (label, id)
select 'open-day', public.save_university_calendar_event(2196, '2196-05-01', '  Open day  ');

select extensions.is(
  (select title || '|' || origin || '|' || status from public.university_calendar_events where id = (select id from saved_ids where label = 'open-day')),
  'Open day|manual|published',
  'an added date is trimmed, published and marked manual'
);

insert into saved_ids (label, id)
select 'census', public.save_university_calendar_event(
  2196, '2196-04-01', 'Semester 1 census date',
  (select id from public.university_calendar_events where calendar_year = 2196 and title = 'Census date')
);

select extensions.is(
  (select event_date::text || '|' || title || '|' || origin from public.university_calendar_events where id = (select id from saved_ids where label = 'census')),
  '2196-04-01|Semester 1 census date|manual',
  'editing a synced date moves it and marks it manual'
);

insert into saved_ids (label, id)
select 'restored', public.save_university_calendar_event(
  2196, '2196-04-10', 'Old open day',
  (select id from saved_ids where label = 'open-day')
);

select extensions.isnt(
  (select id from saved_ids where label = 'restored'),
  (select id from saved_ids where label = 'open-day'),
  'editing onto a removed date restores that row'
);

select extensions.results_eq(
  $$
    select title, status
    from public.university_calendar_events
    where calendar_year = 2196 and title in ('Open day', 'Old open day')
    order by title
  $$,
  $$ values ('Old open day', 'published'), ('Open day', 'archived') $$,
  'the restored row is published and the edited one retired'
);

select extensions.lives_ok(
  $$ select public.remove_university_calendar_event((select id from saved_ids where label = 'restored')) $$,
  'import administrators can remove a key date'
);

select extensions.throws_ok(
  $$ select public.remove_university_calendar_event((select id from saved_ids where label = 'restored')) $$,
  'P0002',
  'That key date is no longer published.',
  'a removed date cannot be removed again'
);

select extensions.results_eq(
  $$
    select action, title, previous_title
    from public.university_calendar_event_changes
    where calendar_year = 2196
    order by id
  $$,
  $$
    values
      ('added', 'Open day', null::text),
      ('edited', 'Semester 1 census date', 'Census date'),
      ('edited', 'Old open day', 'Open day'),
      ('removed', 'Old open day', null::text)
  $$,
  'every hand edit is recorded in the changelog'
);

select extensions.ok(
  (
    select bool_and(changed_by = '7a4c1b8e-3d2f-4e6a-9b1c-5d8e2f3a4b6c')
    from public.university_calendar_event_changes
    where calendar_year = 2196
  ),
  'changes record who made them'
);

select extensions.throws_ok(
  $$ update public.university_calendar_event_changes set title = 'Rewritten' where calendar_year = 2196 $$,
  '42501',
  null,
  'the changelog cannot be rewritten'
);

-- A sync that lists neither hand-entered date keeps both.
insert into saved_ids (label, id)
select 'manual-extra', public.save_university_calendar_event(2196, '2196-06-01', 'Faculty open day');

select extensions.lives_ok(
  $$
    select public.approve_university_calendar_review(
      public.stage_university_calendar_review(
        2196,
        'test-parser',
        '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}'::jsonb,
        jsonb_build_object(
          'externalKey', 'university-calendar-2196',
          'canonicalUrl', 'https://calendar.example.test/?year=2196',
          'fetchedAt', '2196-01-01T00:00:00Z',
          'contentSha256', repeat('e', 64)
        ),
        '[{"date":"2196-02-20","title":"Semester 1 begins"}]'::jsonb,
        '[]'::jsonb
      )
    )
  $$,
  'a sync can be approved around hand-entered dates'
);

reset role;

select extensions.results_eq(
  $$
    select title
    from public.university_calendar_events
    where calendar_year = 2196 and status = 'published'
    order by event_date
  $$,
  $$ values ('Semester 1 begins'), ('Semester 1 census date'), ('Faculty open day') $$,
  'approving a sync keeps every hand-entered date'
);

select set_config('request.jwt.claim.sub', '2e9f6d3c-8b1a-4c7e-a5d2-9f3b6e1c8d4a', true);
set local role authenticated;

select extensions.is(
  (select count(*) from public.university_calendar_event_changes),
  0::bigint,
  'students cannot read the changelog'
);

select extensions.is(
  (select count(*) from public.university_calendar_events where calendar_year = 2196 and status <> 'published'),
  0::bigint,
  'students still see only published dates'
);

reset role;

select * from extensions.finish();
rollback;
