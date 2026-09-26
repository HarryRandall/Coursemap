begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, email)
values
  ('5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11', 'calendar-admin@example.test'),
  ('0c7f8f53-9a4d-4c55-8a51-6ad0c1e6b2a2', 'calendar-student@example.test');

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11';

insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles
cross join private.app_permissions as permissions
where roles.key = 'admin' and permissions.key = 'imports.manage'
on conflict do nothing;

-- A published year the next sync will partly replace.
insert into public.academic_years (year) values (2197);

insert into public.university_calendar_events (
  academic_year_id,
  calendar_year,
  event_date,
  title,
  status
)
select years.id, 2197, events.event_date, events.title, events.status
from (
  values
    ('2197-02-20'::date, 'Semester 1 begins', 'published'),
    ('2197-03-31'::date, 'Census date', 'published'),
    ('2197-12-25'::date, 'Christmas Day public holiday', 'archived')
) as events(event_date, title, status)
join public.academic_years as years on years.year = 2197;

create temporary table review_ids (label text primary key, id uuid) on commit drop;
grant all on review_ids to authenticated;

-- Students cannot stage, read, approve or discard reviews.
select set_config('request.jwt.claim.sub', '0c7f8f53-9a4d-4c55-8a51-6ad0c1e6b2a2', true);
set local role authenticated;

select extensions.throws_ok(
  $$
    select public.stage_university_calendar_review(
      2197,
      'test-parser',
      '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
      jsonb_build_object(
        'externalKey', 'university-calendar-2197',
        'canonicalUrl', 'https://calendar.example.test/?year=2197',
        'fetchedAt', '2197-01-01T00:00:00Z',
        'contentSha256', repeat('b', 64)
      ),
      '[{"date":"2197-02-20","title":"Semester 1 begins"}]',
      '[]'
    )
  $$,
  '42501',
  'Import management permission is required.',
  'students cannot stage a calendar review'
);

reset role;

select set_config('request.jwt.claim.sub', '5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11', true);
set local role authenticated;

select extensions.throws_ok(
  $$
    select public.stage_university_calendar_review(
      2197,
      'test-parser',
      '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
      jsonb_build_object(
        'externalKey', 'university-calendar-2197',
        'canonicalUrl', 'https://calendar.example.test/?year=2197',
        'fetchedAt', '2197-01-01T00:00:00Z',
        'contentSha256', repeat('b', 64)
      ),
      '[{"date":"2196-12-31","title":"Last year"}]',
      '[]'
    )
  $$,
  '22023',
  null,
  'events outside the calendar year are rejected'
);

insert into review_ids (label, id)
select 'first', public.stage_university_calendar_review(
  2197,
  'test-parser',
  '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
  jsonb_build_object(
    'externalKey', 'university-calendar-2197',
    'canonicalUrl', 'https://calendar.example.test/?year=2197',
    'fetchedAt', '2197-01-01T00:00:00Z',
    'contentSha256', repeat('b', 64)
  ),
  '[{"date":"2197-02-20","title":"Semester 1 begins"}]',
  '[]'
);

insert into review_ids (label, id)
select 'second', public.stage_university_calendar_review(
  2197,
  'test-parser',
  '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
  jsonb_build_object(
    'externalKey', 'university-calendar-2197',
    'canonicalUrl', 'https://calendar.example.test/?year=2197',
    'fetchedAt', '2197-01-02T00:00:00Z',
    'contentSha256', repeat('c', 64)
  ),
  '[
    {"date":"2197-02-20","title":"Semester 1 begins"},
    {"date":"2197-06-01","title":"Examination period begins"},
    {"date":"2197-12-25","title":"Christmas Day public holiday"}
  ]',
  '[{"code":"CALENDAR_EVENT_DUPLICATE","severity":"warning","message":"Duplicate."}]'
);

select extensions.is(
  (
    select status
    from public.university_calendar_reviews
    where id = (select id from review_ids where label = 'first')
  ),
  'superseded',
  'a fresh sync supersedes the pending review for the same year'
);

select extensions.is(
  (
    select count(*)
    from public.university_calendar_reviews
    where calendar_year = 2197 and status = 'pending'
  ),
  1::bigint,
  'a year holds one pending review'
);

select extensions.is(
  (select count(*) from public.university_calendar_events where calendar_year = 2197 and status = 'published'),
  2::bigint,
  'staging a review leaves published key dates untouched'
);

select extensions.throws_ok(
  $$
    update public.university_calendar_reviews
    set status = 'approved'
    where calendar_year = 2197
  $$,
  '42501',
  null,
  'reviews cannot be approved by a direct update'
);

select extensions.throws_ok(
  $$
    select public.approve_university_calendar_review(
      (select id from review_ids where label = 'first')
    )
  $$,
  '55000',
  'This key dates review has already been decided.',
  'a superseded review cannot be approved'
);

reset role;

-- Students cannot approve the pending review either.
select set_config('request.jwt.claim.sub', '0c7f8f53-9a4d-4c55-8a51-6ad0c1e6b2a2', true);
set local role authenticated;

select extensions.is(
  (select count(*) from public.university_calendar_reviews),
  0::bigint,
  'students cannot read calendar reviews'
);

select extensions.throws_ok(
  $$
    select public.approve_university_calendar_review(
      (select id from review_ids where label = 'second')
    )
  $$,
  '42501',
  'Import management permission is required.',
  'students cannot approve a calendar review'
);

reset role;

select set_config('request.jwt.claim.sub', '5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    select public.approve_university_calendar_review(
      (select id from review_ids where label = 'second')
    )
  $$,
  'import administrators can approve a pending review'
);

reset role;

select extensions.results_eq(
  $$
    select event_date::text, title, status
    from public.university_calendar_events
    where calendar_year = 2197
    order by event_date, title
  $$,
  $$
    values
      ('2197-02-20', 'Semester 1 begins', 'published'),
      ('2197-03-31', 'Census date', 'archived'),
      ('2197-06-01', 'Examination period begins', 'published'),
      ('2197-12-25', 'Christmas Day public holiday', 'published')
  $$,
  'approval publishes new dates, republishes returning ones and archives dropped ones'
);

select extensions.results_eq(
  $$
    select status, checked_count, added_count, changed_count, archived_count, unchanged_count
    from public.university_calendar_imports
    where academic_year_id = (select id from public.academic_years where year = 2197)
  $$,
  $$ values ('succeeded', 3, 1, 1, 1, 1) $$,
  'approval records the import run with its counts'
);

select extensions.ok(
  (select calendar_published_at is not null from public.academic_years where year = 2197),
  'approval stamps when the year was last published'
);

select extensions.is(
  (
    select count(*)
    from public.university_calendar_reviews as reviews
    join public.university_calendar_imports as imports on imports.id = reviews.import_id
    where reviews.id = (select id from review_ids where label = 'second')
      and reviews.status = 'approved'
      and reviews.decided_by = '5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11'
  ),
  1::bigint,
  'the approved review links to its import run and approver'
);

select extensions.ok(
  (
    select source_page_id is not null
    from public.university_calendar_events
    where calendar_year = 2197 and title = 'Examination period begins'
  ),
  'published dates carry their source page'
);

select set_config('request.jwt.claim.sub', '5b0f5a4e-8c52-4f3e-9d0c-1f4f7a6f2c11', true);
set local role authenticated;

select extensions.throws_ok(
  $$
    select public.approve_university_calendar_review(
      (select id from review_ids where label = 'second')
    )
  $$,
  '55000',
  'This key dates review has already been decided.',
  'an approved review cannot be approved twice'
);

-- A sync with source errors can be discarded but never published.
insert into review_ids (label, id)
select 'broken', public.stage_university_calendar_review(
  2197,
  'test-parser',
  '{"name":"ANU university calendar","kind":"anu_university_calendar","baseUrl":"https://calendar.example.test"}',
  jsonb_build_object(
    'externalKey', 'university-calendar-2197',
    'canonicalUrl', 'https://calendar.example.test/?year=2197',
    'fetchedAt', '2197-01-03T00:00:00Z',
    'contentSha256', repeat('d', 64)
  ),
  '[]',
  '[{"code":"CALENDAR_TABLE_MISSING","severity":"error","message":"Missing."}]'
);

select extensions.throws_ok(
  $$
    select public.approve_university_calendar_review(
      (select id from review_ids where label = 'broken')
    )
  $$,
  '22023',
  'This sync reported source errors, so it cannot be published.',
  'a review with source errors cannot be published'
);

select extensions.lives_ok(
  $$
    select public.discard_university_calendar_review(
      (select id from review_ids where label = 'broken')
    )
  $$,
  'import administrators can discard a pending review'
);

select extensions.is(
  (
    select status
    from public.university_calendar_reviews
    where id = (select id from review_ids where label = 'broken')
  ),
  'discarded',
  'a discarded review keeps its record'
);

reset role;

set local role anon;

select extensions.throws_ok(
  $$ select * from public.university_calendar_reviews $$,
  '42501',
  null,
  'anonymous visitors cannot read calendar reviews'
);

reset role;

select * from extensions.finish();
rollback;
