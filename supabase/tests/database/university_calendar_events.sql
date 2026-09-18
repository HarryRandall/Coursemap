begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

insert into public.academic_years (year)
values (2199), (2198);

insert into public.catalogue_sources (name, kind, base_url, is_active)
values (
  'ANU university calendar test source',
  'anu_university_calendar_test',
  'https://calendar.example.test',
  true
);

select extensions.lives_ok(
  $$
    insert into public.catalogue_source_pages (
      source_id,
      academic_year_id,
      kind,
      external_key,
      canonical_url,
      content_sha256
    )
    select
      sources.id,
      years.id,
      'calendar',
      'university-calendar-2199',
      'https://calendar.example.test/?year=2199',
      repeat('a', 64)
    from public.catalogue_sources as sources
    cross join public.academic_years as years
    where sources.kind = 'anu_university_calendar_test'
      and years.year = 2199
  $$,
  'catalogue source pages accept the calendar kind'
);

select extensions.throws_ok(
  $$
    update public.catalogue_source_pages
    set fetched_at = now()
    where external_key = 'university-calendar-2199'
  $$,
  '55000',
  null,
  'catalogue source pages are immutable'
);

insert into public.university_calendar_events (
  academic_year_id,
  calendar_year,
  event_date,
  title,
  status,
  source_page_id
)
select
  years.id,
  2199,
  events.event_date,
  events.title,
  events.status,
  pages.id
from (
  values
    ('2199-02-23'::date, 'Semester 1 begins', 'published'),
    ('2199-06-04'::date, 'Semester 1 examination period', 'draft'),
    ('2199-12-25'::date, 'Christmas Day public holiday', 'archived')
) as events(event_date, title, status)
join public.academic_years as years on years.year = 2199
join public.catalogue_source_pages as pages
  on pages.external_key = 'university-calendar-2199';

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title
    )
    select id, 2199, '2199-01-01', 'Event on the wrong academic year'
    from public.academic_years
    where year = 2198
  $$,
  '23503',
  null,
  'the calendar year must match the referenced academic year'
);

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title
    )
    select id, 2199, '2198-01-01', 'Event outside its year'
    from public.academic_years
    where year = 2199
  $$,
  '23514',
  null,
  'events must fall inside their calendar year'
);

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title
    )
    select id, 2199, '2199-01-01', '   '
    from public.academic_years
    where year = 2199
  $$,
  '23514',
  null,
  'events must carry a non-blank title'
);

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title, status
    )
    select id, 2199, '2199-01-01', 'Event with a bad status', 'live'
    from public.academic_years
    where year = 2199
  $$,
  '23514',
  null,
  'events only accept draft, published or archived statuses'
);

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title
    )
    select id, 2199, '2199-02-23', 'Semester 1 begins'
    from public.academic_years
    where year = 2199
  $$,
  '23505',
  null,
  'the year, date and title natural key is unique'
);

insert into public.university_calendar_imports (
  academic_year_id,
  source_page_id,
  parser_version,
  status,
  checked_count,
  added_count
)
select years.id, pages.id, 'test', 'succeeded', 3, 3
from public.academic_years as years
join public.catalogue_source_pages as pages
  on pages.external_key = 'university-calendar-2199'
where years.year = 2199;

select extensions.throws_ok(
  $$
    delete from public.university_calendar_imports
  $$,
  '55000',
  null,
  'calendar import records are immutable'
);

set local role anon;

select extensions.results_eq(
  $$
    select title
    from public.university_calendar_events
    where calendar_year = 2199
    order by event_date
  $$,
  $$ values ('Semester 1 begins'::text) $$,
  'anonymous visitors only see published events'
);

select extensions.throws_ok(
  $$
    insert into public.university_calendar_events (
      academic_year_id, calendar_year, event_date, title
    )
    values (1, 2199, '2199-03-01', 'Anonymous write attempt')
  $$,
  '42501',
  null,
  'anonymous visitors cannot write events'
);

select extensions.throws_ok(
  $$ select count(*) from public.university_calendar_imports $$,
  '42501',
  null,
  'anonymous visitors cannot read calendar import records'
);

reset role;

set local role authenticated;

select extensions.results_eq(
  $$
    select count(*)::int
    from public.university_calendar_events
    where calendar_year = 2199
  $$,
  $$ values (1) $$,
  'authenticated users also only see published events'
);

reset role;

select extensions.finish();

rollback;
