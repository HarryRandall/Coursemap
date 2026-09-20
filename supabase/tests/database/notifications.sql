-- The inbox is own-row, and nothing but the row's owner sees it.
--
-- The catalogue write hole came from a permission helper that quietly let every
-- signed-in account through. The notifications table is gated on identity
-- rather than permission, so what has to hold is narrower and testable: one
-- user reads their own rows and no others, no client role can write the table
-- at all, mark_notifications_read() only ever touches the caller's rows, and a
-- producer that runs twice for the same subject leaves one row behind.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(22);

insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'inbox-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'inbox-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'inbox-importer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

-- Shape -----------------------------------------------------------------------

select extensions.ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.notifications'::regclass
  ),
  'row level security is enabled on notifications'
);

select extensions.is(
  (
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'notifications'
      and grantee in ('anon', 'authenticated')
      and privilege_type <> 'SELECT'
  ),
  0,
  'no client role may write a notification'
);

select extensions.is(
  (
    select count(*)::int
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'notifications'
      and grantee = 'anon'
  ),
  0,
  'a signed-out visitor has no access at all'
);

-- The producer is the one insert path, and it is reachable only from inside the
-- database. A client role that could call it could forge a notification into
-- anybody's inbox and name its dedupe key, which is exactly the shape of the
-- catalogue write hole: a routine that looked private while every signed-in
-- account could reach it.
select extensions.is(
  (
    select count(*)::int
    from pg_proc as routines
    join pg_namespace as schemas on schemas.oid = routines.pronamespace
    cross join unnest(array['anon', 'authenticated', 'service_role']) as client(role)
    where schemas.nspname = 'private'
      and routines.proname = 'record_notification'
      and has_function_privilege(client.role, routines.oid, 'execute')
  ),
  0,
  'no client role may call the notification producer'
);

select extensions.ok(
  not has_function_privilege(
    'anon', 'public.mark_notifications_read(uuid[])', 'execute'
  ),
  'a signed-out visitor cannot mark anything read'
);

-- Producers write through the definer routine, as the application does.

do $$
begin
  perform private.record_notification(
    '12000000-0000-4000-8000-000000000001',
    'import_run',
    'Import run #1 completed',
    'Three records ready to review.',
    '/admin/courses/imports?run=1',
    'inbox-test:one'
  );
  perform private.record_notification(
    '12000000-0000-4000-8000-000000000001',
    'plan_risk',
    'A planned course lost its offering',
    null, null,
    'inbox-test:two'
  );
  perform private.record_notification(
    '12000000-0000-4000-8000-000000000002',
    'import_run',
    'Import run #2 failed',
    'All two records failed.',
    '/admin/majors/imports?run=2',
    'inbox-test:three'
  );
end;
$$;

-- Dedupe ----------------------------------------------------------------------

select extensions.ok(
  private.record_notification(
    '12000000-0000-4000-8000-000000000001',
    'import_run',
    'Import run #1 completed',
    'Three records ready to review.',
    '/admin/courses/imports?run=1',
    'inbox-test:one'
  ) is null,
  'a producer repeating the same dedupe key records nothing the second time'
);

select extensions.is(
  (
    select count(*)::int
    from public.notifications
    where dedupe_key = 'inbox-test:one'
  ),
  1,
  'the repeated subject left exactly one row'
);

-- The same key belongs to a different person's inbox independently.
select extensions.ok(
  private.record_notification(
    '12000000-0000-4000-8000-000000000002',
    'import_run',
    'Import run #1 completed',
    null, null,
    'inbox-test:one'
  ) is not null,
  'a dedupe key is scoped to one user, not shared across the table'
);

select extensions.throws_ok(
  $$
    insert into public.notifications (user_id, kind, title, dedupe_key)
    values (
      '12000000-0000-4000-8000-000000000001', 'import_run', 'Forged', 'inbox-test:one'
    )
  $$,
  '23505',
  null,
  'the dedupe constraint is enforced by the database, not only by the producer'
);

-- Rows without a key are one-offs and are not deduplicated.
select extensions.ok(
  private.record_notification(
    '12000000-0000-4000-8000-000000000001', 'key_date', 'Census date', null, null, null
  ) is not null,
  'a notification without a dedupe key is always recorded'
);


-- The import run producer ------------------------------------------------------
--
-- Every path that ends a run writes the run row, so the producer hangs off that
-- write rather than off any one caller. The run rows below are written directly
-- because what is under test is the transition, not the worker.

insert into public.catalogue_import_runs (
  id, academic_year_id, kind, status, requested_model,
  parser_version, prompt_version, schema_version, requested_by,
  target_count, completed_count, failed_count
)
values
  (
    '12000000-0000-4000-8000-00000000aaaa',
    (select id from public.academic_years order by year desc limit 1),
    'course', 'running',
    (select id from public.import_models order by id limit 1),
    'test', 'test', 'test',
    '12000000-0000-4000-8000-000000000003',
    3, 3, 0
  ),
  (
    '12000000-0000-4000-8000-00000000bbbb',
    (select id from public.academic_years order by year desc limit 1),
    'major', 'running',
    (select id from public.import_models order by id limit 1),
    'test', 'test', 'test',
    null,
    1, 0, 1
  );

update public.catalogue_import_runs
set status = 'completed'
where id = '12000000-0000-4000-8000-00000000aaaa';

select extensions.is(
  (
    select body
    from public.notifications
    where user_id = '12000000-0000-4000-8000-000000000003'
  ),
  '3 records ready to review.',
  'a finished run tells the administrator who asked for it what it produced'
);

select extensions.is(
  (
    select href
    from public.notifications
    where user_id = '12000000-0000-4000-8000-000000000003'
  ),
  format(
    '/admin/courses/imports?run=%s',
    '12000000-0000-4000-8000-00000000aaaa'
  ),
  'the notification opens the run it is about'
);

-- A recovered target can move a run out of a terminal status and back again.
update public.catalogue_import_runs
set status = 'running'
where id = '12000000-0000-4000-8000-00000000aaaa';

update public.catalogue_import_runs
set status = 'failed'
where id = '12000000-0000-4000-8000-00000000aaaa';

select extensions.is(
  (
    select count(*)::int
    from public.notifications
    where user_id = '12000000-0000-4000-8000-000000000003'
  ),
  1,
  'a run that finishes more than once is reported once'
);

update public.catalogue_import_runs
set status = 'failed'
where id = '12000000-0000-4000-8000-00000000bbbb';

select extensions.is(
  (
    select count(*)::int
    from public.notifications
    where kind = 'import_run'
      and href like '/admin/majors/imports?run=12000000-0000-4000-8000-00000000bbbb'
  ),
  0,
  'a run whose requester is gone notifies nobody'
);

-- The second inbox's real notification ids, captured while they are still
-- visible. Passing null to mark_notifications_read() means "all of mine", so
-- the test has to hand it ids that exist and belong to somebody else.
select set_config(
  'tests.other_inbox_ids',
  (
    select string_agg(id::text, ',')
    from public.notifications
    where user_id = '12000000-0000-4000-8000-000000000002'
  ),
  false
);

-- The first user ---------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*)::int from public.notifications),
  3,
  'a user reads their own notifications'
);

select extensions.is(
  (
    select count(*)::int
    from public.notifications
    where user_id <> '12000000-0000-4000-8000-000000000001'
  ),
  0,
  'a user cannot read another inbox'
);

select extensions.throws_ok(
  $$
    insert into public.notifications (user_id, kind, title)
    values ('12000000-0000-4000-8000-000000000002', 'import_run', 'Forged')
  $$,
  '42501',
  null,
  'a user cannot write into another inbox'
);

select extensions.throws_ok(
  $$
    insert into public.notifications (user_id, kind, title)
    values ('12000000-0000-4000-8000-000000000001', 'import_run', 'Self-made')
  $$,
  '42501',
  null,
  'a user cannot write into their own inbox either'
);

-- The second user's rows are invisible, so aiming mark_notifications_read() at
-- them is the interesting case: the ids are real and the caller is not.
select extensions.is(
  public.mark_notifications_read(
    string_to_array(current_setting('tests.other_inbox_ids'), ',')::uuid[]
  ),
  0,
  'marking another user''s notification ids read changes nothing'
);

select extensions.is(
  public.mark_notifications_read(),
  3,
  'marking everything read covers only the caller''s unread rows'
);

select extensions.is(
  (select count(*)::int from public.notifications where read_at is null),
  0,
  'the caller has nothing unread left'
);

-- The second user ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select extensions.is(
  (select count(*)::int from public.notifications where read_at is null),
  2,
  'the other inbox was untouched by the first user marking theirs read'
);

reset role;

select * from extensions.finish();

rollback;
