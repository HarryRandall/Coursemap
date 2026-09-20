-- Writing catalogue content is an administrative act.
--
-- private.can_manage_catalogue() once gated every catalogue write policy while
-- returning true for courses.read_drafts, which the default `user` role grants
-- to every sign-up. Combined with insert and update grants to `authenticated`,
-- any signed-in account could publish arbitrary content to the anonymous
-- catalogue. Nothing asserted otherwise, so nothing caught it.

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (
  instance_id, id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'catalogue-student@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'catalogue-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

-- The new-user trigger grants `user`; one row per user, so the administrator is
-- promoted rather than given a second role.
update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '11000000-0000-4000-8000-000000000002';

select extensions.is(
  (
    select count(*)::int
    from private.user_roles as user_roles
    join private.app_roles as roles on roles.id = user_roles.role_id
    where user_roles.user_id = '11000000-0000-4000-8000-000000000001'
      and roles.key = 'user'
  ),
  1,
  'a new account holds the default user role'
);

select extensions.ok(
  to_regprocedure('private.can_manage_catalogue()') is null,
  'the permissive catalogue helper is gone'
);

-- The ordinary student ------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select extensions.ok(
  private.can_read_catalogue_drafts(),
  'a student still reads catalogue drafts'
);

select extensions.ok(
  not private.can_write_catalogue(),
  'a student cannot write catalogue content'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_items (kind, code) values ('course', 'PWND1234') $$,
  '42501',
  null,
  'a student cannot create a catalogue item'
);

select extensions.throws_ok(
  $$ update public.catalogue_item_years set published_snapshot_id = null $$,
  '42501',
  null,
  'a student cannot unpublish a catalogue record'
);

select extensions.throws_ok(
  $$
    insert into public.catalogue_snapshots (item_year_id, kind, academic_year_id, origin)
    select item_years.id, item_years.kind, item_years.academic_year_id, 'manual'
    from public.catalogue_item_years as item_years limit 1
  $$,
  '42501',
  null,
  'a student cannot create a snapshot'
);

-- The administrator ---------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select extensions.ok(
  private.can_write_catalogue(),
  'an administrator writes catalogue content'
);

select * from extensions.finish();

rollback;
