-- Who reads what after 042_student_data_access.
--
-- A sign-up reads published catalogue content and their own records. Reading
-- another student's plan, results or student number takes students.read, and
-- a row hanging off a plan must belong to that plan's owner.

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
    '42000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'access-a@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'access-b@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'access-staff@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set student_number = 'u1234567'
where id = '42000000-0000-4000-8000-000000000001';

-- A staff role that opens administration but cannot read student records.
insert into private.app_roles (key, name, description)
values ('access_test_staff', 'Access test staff', 'admin.access only.');

insert into private.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from private.app_roles as roles, private.app_permissions as permissions
where roles.key = 'access_test_staff'
  and permissions.key = 'admin.access';

update private.user_roles
set role_id = (select id from private.app_roles where key = 'access_test_staff')
where user_id = '42000000-0000-4000-8000-000000000003';

-- A 2027 record that has a draft and has never been published.
insert into public.catalogue_codes (kind, code)
values ('course', 'ACCS2027');

insert into public.catalogue_records (code_id, kind, academic_year_id)
select codes.id, 'course', years.id
from public.catalogue_codes as codes, public.academic_years as years
where codes.code = 'ACCS2027'
  and years.year = 2027;

insert into public.catalogue_drafts (record_id, content, content_hash)
select records.id, '{}'::jsonb, repeat('a', 64)
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
where codes.code = 'ACCS2027';

-- COMP1100 is also offered, unpublished, in 2027. Its code is public through
-- 2026, which used to make the 2027 record visible too.
insert into public.catalogue_records (code_id, kind, academic_year_id)
select codes.id, 'course', years.id
from public.catalogue_codes as codes, public.academic_years as years
where codes.code = 'COMP1100'
  and years.year = 2027;

insert into public.plans (
  id, owner_id, academic_year_id, name, is_primary, commencement_year, study_load
)
select plan_ids.id, plan_ids.owner_id,
  (select id from public.academic_years where year = 2026),
  'Access plan', true, 2026, 'full_time'
from (
  values
    ('42000000-0000-4000-8000-0000000000a1'::uuid,
     '42000000-0000-4000-8000-000000000001'::uuid),
    ('42000000-0000-4000-8000-0000000000b1'::uuid,
     '42000000-0000-4000-8000-000000000002'::uuid)
) as plan_ids (id, owner_id);

-- A plans the unpublished 2027 COMP1100 and records a result.
insert into public.plan_items (plan_id, owner_id, catalogue_record_id)
select '42000000-0000-4000-8000-0000000000a1',
  '42000000-0000-4000-8000-000000000001', records.id
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
join public.academic_years as years on years.id = records.academic_year_id
where codes.code = 'COMP1100'
  and years.year = 2027;

insert into public.plan_structures (plan_id, owner_id, role, catalogue_record_id)
select '42000000-0000-4000-8000-0000000000a1',
  '42000000-0000-4000-8000-000000000001', 'programme', records.id
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
where codes.code = 'BCOMP';

-- A new account -------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select extensions.ok(
  not private.can_read_catalogue_drafts(),
  'a new account cannot read catalogue drafts'
);

select extensions.is_empty(
  $$ select 1 from public.catalogue_drafts $$,
  'a new account sees no drafts'
);

select extensions.is_empty(
  $$
    select 1
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.code in ('ACCS2027', 'COMP1100')
      and records.published_version_id is null
  $$,
  'a new account sees no unpublished catalogue records'
);

select extensions.throws_ok(
  $$ select public.catalogue_publish_blockers(1) $$,
  '42501',
  null,
  'a new account cannot ask whether a record can be published'
);

select extensions.is_empty(
  $$ select 1 from public.plans where owner_id <> (select auth.uid()) $$,
  'a student reads no other student''s plan'
);

-- B knows A's plan id and tries to attach rows to it.

select extensions.throws_ok(
  $$
    insert into public.plan_starred_courses (plan_id, owner_id, course_code)
    values (
      '42000000-0000-4000-8000-0000000000a1',
      '42000000-0000-4000-8000-000000000002',
      'COMP1110'
    )
  $$,
  '23503',
  null,
  'a student cannot star a course in another student''s plan'
);

select extensions.throws_ok(
  $$
    insert into public.plan_requirement_placements (
      plan_id, owner_id, course_code, structure_code, requirement_key
    )
    values (
      '42000000-0000-4000-8000-0000000000a1',
      '42000000-0000-4000-8000-000000000002',
      'COMP1110', 'BCOMP', 'core'
    )
  $$,
  '23503',
  null,
  'a student cannot place a course in another student''s plan'
);

select extensions.throws_ok(
  $$
    insert into public.plan_structures (plan_id, owner_id, role, catalogue_record_id)
    select '42000000-0000-4000-8000-0000000000a1',
      '42000000-0000-4000-8000-000000000002', 'minor', records.id
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.code = 'HCCC-MIN'
  $$,
  '23503',
  null,
  'a student cannot add a programme or minor to another student''s plan'
);

select extensions.lives_ok(
  $$
    insert into public.plan_starred_courses (plan_id, owner_id, course_code)
    values (
      '42000000-0000-4000-8000-0000000000b1',
      '42000000-0000-4000-8000-000000000002',
      'COMP1110'
    )
  $$,
  'a student still stars a course in their own plan'
);

-- The student whose plan names an unpublished year -----------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select extensions.is(
  (
    select count(*)::int
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.code = 'COMP1100'
      and records.published_version_id is null
  ),
  1,
  'a student still reads the unpublished record their own plan names'
);

select extensions.is_empty(
  $$
    select 1
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.code = 'ACCS2027'
  $$,
  'that does not reveal other unpublished records'
);

-- A planned course whose code has never been published is still named.
reset role;

insert into public.plan_items (plan_id, owner_id, catalogue_record_id)
select '42000000-0000-4000-8000-0000000000a1',
  '42000000-0000-4000-8000-000000000001', records.id
from public.catalogue_records as records
join public.catalogue_codes as codes on codes.id = records.code_id
where codes.code = 'ACCS2027';

set local role authenticated;

select extensions.is(
  (select count(*)::int from public.catalogue_codes where code = 'ACCS2027'),
  1,
  'a student reads the code of an unpublished course their plan names'
);

-- Staff with admin.access only ------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"42000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select extensions.ok(
  private.has_permission('admin.access')
    and not private.has_permission('students.read'),
  'the staff fixture opens administration without students.read'
);

select extensions.is_empty(
  $$ select 1 from public.plans where owner_id <> (select auth.uid()) $$,
  'admin.access alone reads no student plans'
);

select extensions.is_empty(
  $$ select 1 from public.plan_items where owner_id <> (select auth.uid()) $$,
  'admin.access alone reads no planned courses'
);

select extensions.is(
  (
    select count(*)::int
    from public.admin_users
    where user_id = '42000000-0000-4000-8000-000000000001'
      and student_number is null
  ),
  1,
  'admin.access alone lists the account without its student number'
);

-- Administrators keep student records through the explicit grant ----------------

reset role;

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '42000000-0000-4000-8000-000000000003';

set local role authenticated;

select extensions.is(
  (
    select count(*)::int
    from public.plans
    where id in (
      '42000000-0000-4000-8000-0000000000a1',
      '42000000-0000-4000-8000-0000000000b1'
    )
  ),
  2,
  'the admin role reads student plans through students.read'
);

select extensions.is(
  (
    select student_number
    from public.admin_users
    where user_id = '42000000-0000-4000-8000-000000000001'
  ),
  'u1234567',
  'the admin role reads student numbers through students.read'
);

-- Anonymous visitors ------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.is_empty(
  $$ select 1 from public.catalogue_records where published_version_id is null $$,
  'anonymous visitors see no unpublished catalogue records'
);

select extensions.ok(
  not has_column_privilege('anon', 'public.catalogue_publications', 'published_by', 'select')
    and has_column_privilege('anon', 'public.catalogue_publications', 'published_at', 'select'),
  'anonymous visitors see when content was published but not by whom'
);

select extensions.is_empty(
  $$
    select functions.oid::regprocedure::text
    from pg_proc as functions
    where functions.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', functions.oid, 'execute')
      and functions.proname not in (
        'published_course_availability',
        'published_course_detail',
        'published_requirement_graph',
        'published_structure_detail',
        'published_structure_years'
      )
  $$,
  'anonymous visitors call only the published catalogue reads'
);

-- Deleting a plan takes its rows with it ----------------------------------------

reset role;

delete from public.plans where id = '42000000-0000-4000-8000-0000000000a1';

select extensions.is_empty(
  $$
    select 1
    from public.plan_structures
    where plan_id = '42000000-0000-4000-8000-0000000000a1'
  $$,
  'deleting a plan deletes its programme and structure rows'
);

select * from extensions.finish();

rollback;
