begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(35);

select extensions.ok(
  to_regprocedure('public.set_user_role(uuid,text)') is not null,
  'the role-assignment RPC exists'
);

select extensions.ok(
  to_regprocedure('public.set_role_permission(bigint,bigint,boolean)') is not null,
  'the role-permission RPC exists'
);

select extensions.ok(
  exists (
    select 1
    from pg_proc as functions
    where functions.oid =
      'public.set_user_role(uuid,text)'::regprocedure
      and not functions.prosecdef
      and functions.provolatile = 'v'
      and functions.proconfig @> array['search_path=""']::text[]
  ),
  'the role-assignment RPC is volatile security invoker with a fixed search path'
);

select extensions.ok(
  exists (
    select 1
    from pg_proc as functions
    where functions.oid =
      'public.set_role_permission(bigint,bigint,boolean)'::regprocedure
      and not functions.prosecdef
      and functions.provolatile = 'v'
      and functions.proconfig @> array['search_path=""']::text[]
  ),
  'the role-permission RPC is volatile security invoker with a fixed search path'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.set_user_role(uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_user_role(uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.set_user_role(uuid,text)',
    'execute'
  ),
  'only authenticated API users can execute the role-assignment RPC'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.set_role_permission(bigint,bigint,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.set_role_permission(bigint,bigint,boolean)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.set_role_permission(bigint,bigint,boolean)',
    'execute'
  ),
  'only authenticated API users can execute the role-permission RPC'
);

select extensions.ok(
  exists (
    select 1
    from pg_class as relations
    where relations.oid = 'public.admin_users'::regclass
      and relations.relkind = 'v'
      and relations.reloptions @> array['security_invoker=true']::text[]
  )
  and exists (
    select 1
    from pg_class as relations
    where relations.oid = 'public.admin_roles'::regclass
      and relations.reloptions @> array['security_invoker=true']::text[]
  )
  and exists (
    select 1
    from pg_class as relations
    where relations.oid = 'public.admin_permissions'::regclass
      and relations.relkind = 'v'
      and relations.reloptions @> array['security_invoker=true']::text[]
  )
  and exists (
    select 1
    from pg_class as relations
    where relations.oid = 'public.admin_role_permissions'::regclass
      and relations.relkind = 'v'
      and relations.reloptions @> array['security_invoker=true']::text[]
  )
  and exists (
    select 1
    from pg_class as relations
    where relations.oid = 'public.admin_user_roles'::regclass
      and relations.reloptions @> array['security_invoker=true']::text[]
  ),
  'all admin projections are security-invoker views'
);

select extensions.ok(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'plans_owner_or_reader_select',
        'plan_structures_owner_or_reader_select',
        'plan_items_owner_or_reader_select',
        'course_attempts_owner_or_reader_select'
      )
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ) = 4,
  'student planning records have explicit student-record read policies'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'users-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Users Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '70000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'users-student@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Users Student"}'::jsonb,
    now(),
    now()
  );

select extensions.results_eq(
  $$
    select email, display_name
    from public.profiles
    where id = '70000000-0000-4000-8000-000000000002'
  $$,
  $$values ('users-student@example.test'::text, 'Users Student'::text)$$,
  'new Auth users receive an email-backed profile'
);

update auth.users
set email = 'renamed-student@example.test'
where id = '70000000-0000-4000-8000-000000000002';

update public.profiles
set student_number = 'u7654321'
where id = '70000000-0000-4000-8000-000000000002';

select extensions.is(
  (
    select email
    from public.profiles
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'renamed-student@example.test'::text,
  'Auth email changes stay synchronised to the profile'
);

insert into private.user_roles (user_id, role_id, granted_by)
select
  '70000000-0000-4000-8000-000000000001',
  roles.id,
  '70000000-0000-4000-8000-000000000001'
from private.app_roles as roles
where roles.key = 'admin'
on conflict (user_id) do update
set
  role_id = excluded.role_id,
  granted_by = excluded.granted_by,
  granted_at = now();

insert into public.plans (
  owner_id,
  academic_year_id,
  name,
  is_primary,
  status,
  commencement_year,
  study_load
)
select
  users.id,
  years.id,
  'Admin user management test plan',
  true,
  'active',
  years.year,
  'full_time'
from auth.users as users
cross join public.academic_years as years
where users.id in (
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002'
  )
  and years.year = 2026;

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.is(
  (
    select count(*)
    from public.admin_users
    where user_id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002'
    )
  ),
  0::bigint,
  'a student cannot read the admin user projection'
);

select extensions.is(
  (select count(*) from public.admin_roles),
  0::bigint,
  'a student cannot read the admin role catalogue'
);

select extensions.is(
  (
    (select count(*) from public.admin_permissions)
    + (select count(*) from public.admin_role_permissions)
  ),
  0::bigint,
  'a student cannot read permission definitions or role grants'
);

select extensions.is(
  (select count(*) from public.plans),
  1::bigint,
  'a student can read their own plan but not another user plan'
);

select extensions.throws_ok(
  $$
    select public.set_user_role(
      '70000000-0000-4000-8000-000000000002',
      'admin'
    )
  $$,
  '42501',
  'Administrator access is required.',
  'a student cannot assign roles'
);

select extensions.throws_ok(
  $$
    select public.set_role_permission(1, 1, true)
  $$,
  '42501',
  'Administrator access is required.',
  'a student cannot change role permissions'
);

select extensions.throws_ok(
  $$
    update public.profiles
    set email = 'forged@example.test'
    where id = '70000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'permission denied for table profiles',
  'a user cannot overwrite their Auth-managed profile email'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.is(
  (
    select count(*)
    from public.admin_users
    where user_id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002'
    )
  ),
  2::bigint,
  'an administrator can list Coursemap users'
);

select extensions.ok(
  exists (
    select 1
    from public.admin_users
    where user_id = '70000000-0000-4000-8000-000000000002'
      and student_number = 'u7654321'
  ),
  'the administrator profile projection includes study identity'
);

select extensions.is(
  (
    select count(*)
    from public.plans
    where owner_id = '70000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'an administrator can read another user primary plan'
);

update public.plans
set name = 'Administrator changed this plan'
where owner_id = '70000000-0000-4000-8000-000000000002';

select extensions.is(
  (
    select name
    from public.plans
    where owner_id = '70000000-0000-4000-8000-000000000002'
  ),
  'Admin user management test plan'::text,
  'administrator study access remains read-only'
);

select extensions.ok(
  exists (
    select 1
    from public.admin_roles
    where role_key = 'admin'
      and permission_keys @> array[
        'admin.access',
        'catalogue.write',
        'courses.write'
      ]::text[]
  ),
  'the role catalogue includes effective permissions'
);

select extensions.ok(
  exists (
    select 1
    from public.admin_roles
    where role_key = 'admin'
      and role_description is not null
  )
  and exists (
    select 1
    from public.admin_permissions
    where permission_key = 'catalogue.read_drafts'
      and permission_name = 'View draft catalogue'
      and permission_category = 'catalogue'
      and permission_description is not null
  )
  and exists (
    select 1
    from public.admin_permissions
    where permission_key = 'courses.read_drafts'
      and permission_name = 'View draft courses'
      and permission_category = 'courses'
      and permission_description is not null
  ),
  'the editable role catalogue includes display metadata'
);

select extensions.is(
  public.set_role_permission(
    (select role_id from public.admin_roles where role_key = 'user'),
    (
      select permission_id
      from public.admin_permissions
      where permission_key = 'imports.manage'
    ),
    true
  ),
  true,
  'an administrator can enable a role permission'
);

select extensions.ok(
  exists (
    select 1
    from public.admin_role_permissions as grants
    join public.admin_roles as roles on roles.role_id = grants.role_id
    join public.admin_permissions as permissions
      on permissions.permission_id = grants.permission_id
    where roles.role_key = 'user'
      and permissions.permission_key = 'imports.manage'
  ),
  'an enabled role permission appears in the admin projection'
);

select extensions.is(
  public.set_role_permission(
    (select role_id from public.admin_roles where role_key = 'user'),
    (
      select permission_id
      from public.admin_permissions
      where permission_key = 'imports.manage'
    ),
    false
  ),
  false,
  'an administrator can disable a role permission'
);

select extensions.ok(
  not exists (
    select 1
    from public.admin_role_permissions as grants
    join public.admin_roles as roles on roles.role_id = grants.role_id
    join public.admin_permissions as permissions
      on permissions.permission_id = grants.permission_id
    where roles.role_key = 'user'
      and permissions.permission_key = 'imports.manage'
  ),
  'a disabled role permission is removed from the admin projection'
);

select extensions.throws_ok(
  $$
    select public.set_role_permission(
      (select role_id from public.admin_roles where role_key = 'admin'),
      (
        select permission_id
        from public.admin_permissions
        where permission_key = 'admin.access'
      ),
      false
    )
  $$,
  '22023',
  'Administrator access is required for the admin role.',
  'the admin role keeps its required access permission'
);

select extensions.throws_ok(
  $$
    select public.set_role_permission(999999, 999999, true)
  $$,
  '22023',
  'The selected role or permission does not exist.',
  'unknown role and permission identifiers are rejected'
);

select extensions.is(
  public.set_user_role(
    '70000000-0000-4000-8000-000000000002',
    'admin'
  ),
  'admin'::text,
  'an administrator can change an account role'
);

select extensions.ok(
  exists (
    select 1
    from public.admin_user_roles
    where user_id = '70000000-0000-4000-8000-000000000002'
      and role_key = 'admin'
      and granted_by = '70000000-0000-4000-8000-000000000001'
  ),
  'the assigned role appears in the admin projection'
);

select extensions.is(
  public.set_user_role(
    '70000000-0000-4000-8000-000000000002',
    'user'
  ),
  'user'::text,
  'an administrator can restore the default user role'
);

select extensions.throws_ok(
  $$
    select public.set_user_role(
      '70000000-0000-4000-8000-000000000001',
      'user'
    )
  $$,
  '22023',
  'You cannot remove your own administrator role.',
  'an administrator cannot remove their own administrator role'
);

select extensions.throws_ok(
  $$
    select public.set_user_role(
      '70000000-0000-4000-8000-000000000002',
      'role_that_does_not_exist'
    )
  $$,
  '22023',
  'The selected role does not exist.',
  'an unknown role is rejected'
);

select extensions.is(
  (
    select count(*)
    from private.user_roles
    where user_id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002'
    )
  ),
  2::bigint,
  'every account keeps exactly one role after failed and successful changes'
);

reset role;

select * from extensions.finish();

rollback;
