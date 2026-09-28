begin;
\ir ../helpers/catalogue-fixtures.inc
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

insert into public.academic_years(year) values (2195), (2196);
create temporary table initial_periods as
  select id, code from public.academic_periods where calendar_year = 2195;

select extensions.is(
  (select count(*)::integer from public.academic_periods where calendar_year = 2195 and starts_on is null and ends_on is null and status = 'published'),
  6, 'a new year has all six usable periods without invented dates'
);
select extensions.throws_ok(
  $$update public.academic_periods set starts_on = '2195-01-01' where calendar_year = 2195 and code = 'SUMMER'$$,
  '23514', null, 'a period cannot have only one date bound'
);

insert into public.university_calendar_events(academic_year_id, calendar_year, event_date, title, status)
select years.id, 2195, events.event_date, events.title, 'published'
from (values
  ('2195-01-01'::date, 'Summer Session begins'), ('2195-03-31'::date, 'Summer Session ends'),
  ('2195-02-23'::date, 'Semester 1 begins'), ('2195-05-29'::date, 'Semester 1 ends'),
  ('2195-04-01'::date, 'Autumn Session commences'), ('2195-06-30'::date, 'Autumn Session ends'),
  ('2195-07-01'::date, 'Winter Session begins'), ('2195-09-30'::date, 'Winter Session ends'),
  ('2195-07-27'::date, 'Semester 2 begins'), ('2195-10-30'::date, 'Semester 2 ends'),
  ('2195-10-01'::date, 'Spring Session commences'), ('2195-12-31'::date, 'Spring Session ends'),
  ('2195-06-20'::date, 'Semester 1 examination period ends'),
  ('2195-06-01'::date, 'Semester 2 of prior year deferred examination period begins')
) as events(event_date, title)
join public.academic_years as years on years.year = 2195;

select extensions.is(
  (select count(*)::integer from public.academic_periods where calendar_year = 2195 and starts_on is not null),
  0, 'unapproved calendar content does not supply dates before publication'
);
update public.academic_years set calendar_published_at = now() where year = 2195;
select extensions.is(
  (select count(*)::integer from public.academic_periods where calendar_year = 2195 and starts_on is not null and ends_on is not null),
  6, 'calendar publication derives semesters and all seasonal sessions'
);
select extensions.ok(
  (select starts_on = '2195-07-01' and ends_on = '2195-09-30' from public.academic_periods where calendar_year = 2195 and code = 'WINTER'),
  'winter uses its own session boundaries'
);
select extensions.ok(
  (select starts_on = '2195-02-23' and ends_on = '2195-05-29' from public.academic_periods where calendar_year = 2195 and code = 'S1'),
  'exam and prior-year events do not become semester boundaries'
);
select extensions.is(
  (select count(*)::integer from public.academic_periods as periods join initial_periods using(id, code) where periods.calendar_year = 2195),
  6, 'publication preserves existing period IDs'
);
select extensions.ok(
  (select bool_and(starts_event_id is not null and ends_event_id is not null) from public.academic_periods where calendar_year = 2195),
  'calendar bounds retain their source event IDs'
);

update public.university_calendar_events set status = 'archived'
where calendar_year = 2195 and title = 'Winter Session ends';
update public.academic_years set calendar_published_at = now() where year = 2195;
select extensions.ok(
  (select ends_on = '2195-09-30' from public.academic_periods where calendar_year = 2195 and code = 'WINTER'),
  'an incomplete source does not clear established dates'
);

insert into public.university_calendar_events(academic_year_id, calendar_year, event_date, title, status)
select id, 2195, '2195-07-02', 'Winter Session commences', 'published'
from public.academic_years where year = 2195;
update public.academic_years set calendar_published_at = now() where year = 2195;
select extensions.ok(
  (select starts_on = '2195-07-01' from public.academic_periods where calendar_year = 2195 and code = 'WINTER'),
  'conflicting boundaries do not overwrite established dates'
);

insert into auth.users(id, email) values
  ('99000000-0000-4000-8000-000000000001', 'period-calendar-admin@example.test'),
  ('99000000-0000-4000-8000-000000000002', 'period-calendar-student@example.test');
update private.user_roles set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '99000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
set local role authenticated;

create temporary table period_review(id uuid);
insert into period_review select public.stage_university_calendar_review(
  2196, 'period-test',
  '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
  jsonb_build_object('externalKey', 'calendar-2196', 'canonicalUrl', 'https://calendar.example.test/?year=2196',
    'fetchedAt', '2196-01-01T00:00:00Z', 'contentSha256', repeat('c', 64)),
  '[{"date":"2196-07-01","title":"Winter Session begins"},{"date":"2196-09-30","title":"Winter Session ends"}]', '[]'
);
select extensions.ok(
  (select starts_on = '2196-07-01' and ends_on = '2196-09-30' and issue is null
   from public.preview_university_calendar_periods((select id from period_review)) where code = 'WINTER'),
  'review previews dates before publication'
);
select extensions.ok(
  (select issue = 'Calendar dates pending.' from public.preview_university_calendar_periods((select id from period_review)) where code = 'S1'),
  'review shows which periods still lack source dates'
);
select extensions.ok(
  (select starts_on is null from public.academic_periods where calendar_year = 2196 and code = 'WINTER'),
  'staging and preview do not publish period dates'
);
select extensions.lives_ok(
  $$select public.approve_university_calendar_review((select id from period_review))$$,
  'console approval publishes calendar events and periods in one transaction'
);
select extensions.ok(
  (select starts_on = '2196-07-01' and ends_on = '2196-09-30' from public.academic_periods where calendar_year = 2196 and code = 'WINTER'),
  'console approval supplies winter dates'
);

select public.save_university_calendar_event(2196, '2196-07-02', 'Winter Session begins',
  (select id from public.university_calendar_events where calendar_year = 2196 and title = 'Winter Session begins'));
select extensions.ok(
  (select starts_on = '2196-07-02' from public.academic_periods where calendar_year = 2196 and code = 'WINTER'),
  'manual calendar corrections reconcile period dates too'
);

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
select extensions.throws_ok(
  $$select public.preview_university_calendar_periods((select id from period_review))$$,
  '42501', 'Import management permission is required.', 'students cannot preview private calendar reviews'
);
reset role;
select extensions.ok(
  not has_function_privilege('anon', 'public.preview_university_calendar_periods(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.reconcile_academic_periods(integer)', 'execute'),
  'anonymous callers and students cannot invoke privileged period reconciliation'
);
select pg_temp.publish_course('PERD1000', 2196::smallint);
insert into public.course_attempts(owner_id, catalogue_version_id, academic_period_id, status, units_attempted)
select '99000000-0000-4000-8000-000000000002', records.published_version_id, periods.id, 'enrolled', 6
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
join public.academic_periods as periods on periods.calendar_year = 2196 and periods.code = 'WINTER'
where codes.code = 'PERD1000';
update public.academic_periods set status = 'draft' where calendar_year = 2196 and code in ('WINTER', 'S1');
-- History access must also work when the User role cannot read drafts.
delete from private.role_permissions
where role_id = (select id from private.app_roles where key = 'user')
  and permission_id = (select id from private.app_permissions where key = 'catalogue.read_drafts');
set local role authenticated;
select extensions.ok(
  exists(select 1 from public.academic_periods where calendar_year = 2196 and code = 'WINTER'),
  'a student can read the draft period identity referenced by their own history'
);
select extensions.ok(
  not exists(select 1 from public.academic_periods where calendar_year = 2196 and code = 'S1'),
  'own history access does not expose other draft periods'
);
reset role;
select * from extensions.finish();
rollback;
