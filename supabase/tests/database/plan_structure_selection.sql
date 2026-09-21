begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

select extensions.ok(
  to_regprocedure(
    'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text,text[],text[])'
  ) is not null
  and to_regprocedure(
    'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text)'
  ) is null
  and has_function_privilege(
    'authenticated',
    'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text,text[],text[])',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text,text[],text[])',
    'execute'
  ),
  'the student plan RPC exposes the multi-structure signature only to authenticated users'
);

select extensions.ok(
  exists (
    select 1
    from pg_proc as functions
    where functions.oid =
      'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text,text[],text[])'::regprocedure
      and not functions.prosecdef
      and functions.proconfig @> array['search_path=""']::text[]
  ),
  'the student plan RPC remains security invoker with a fixed search path'
);

select extensions.ok(
  exists (
    select 1
    from pg_trigger as triggers
    where triggers.tgrelid = 'public.plan_structures'::regclass
      and triggers.tgname = 'plan_structures_validate_kind'
      and not triggers.tgisinternal
  )
  and to_regclass('public.plan_structures_one_major_idx') is not null,
  'plan rows enforce matching structure kinds and at most one major'
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
values (
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'plan-structures@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select pg_temp.create_structure_snapshot(
  selected.kind, selected.code, 2030::smallint, selected.code || ' test structure',
  case when selected.kind = 'programme' then 144 else 24 end,
  case when selected.kind = 'programme' then 3 else null end
)
from (
  values
    ('programme'::text, 'PLAN-LINK-PROG'::text),
    ('major', 'PLAN-LINK-MAJOR'),
    ('minor', 'PLAN-LINK-MIN-A'),
    ('minor', 'PLAN-LINK-MIN-B'),
    ('specialisation', 'PLAN-LINK-SPEC'),
    ('minor', 'PLAN-LINK-UNRELATED')
) as selected(kind, code);

insert into public.academic_structure_snapshot_relationships (
  version_id,
  position,
  relationship_kind,
  target_kind,
  target_code,
  source_text,
  source_locator
)
select
  snapshots.id,
  selected.position,
  'option',
  selected.target_kind,
  selected.target_code,
  'Explicit programme structure option.',
  '#test-structure-option'
from public.catalogue_versions as snapshots
join public.catalogue_records as item_years on item_years.id = snapshots.record_id
join public.catalogue_codes as items on items.id = item_years.code_id
cross join (
  values
    (1, 'major'::text, 'PLAN-LINK-MAJOR'::text),
    (2, 'minor', 'PLAN-LINK-MIN-A'),
    (3, 'minor', 'PLAN-LINK-MIN-B'),
    (4, 'specialisation', 'PLAN-LINK-SPEC')
) as selected(position, target_kind, target_code)
where items.code = 'PLAN-LINK-PROG';

select pg_temp.publish_snapshot(snapshots.id)
from public.catalogue_versions as snapshots
join public.catalogue_records as item_years on item_years.id = snapshots.record_id
join public.catalogue_codes as items on items.id = item_years.code_id
where items.code like 'PLAN-LINK-%';

select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.lives_ok(
  $$
    select public.save_current_user_primary_plan(
      'Plan Structure Student',
      'u1234567',
      2030::smallint,
      2030::smallint,
      'full_time',
      'PLAN-LINK-PROG',
      'PLAN-LINK-MAJOR',
      array['PLAN-LINK-MIN-A', 'PLAN-LINK-MIN-B'],
      array['PLAN-LINK-SPEC']
    )
  $$,
  'a student can save one major and multiple minors and specialisations'
);

select extensions.results_eq(
  $$
    select plan_structures.role, structures.code, plan_structures.position
    from public.plan_structures
    join public.catalogue_records as structure_years
      on structure_years.id = plan_structures.catalogue_record_id
    join public.catalogue_codes as structures
      on structures.id = structure_years.code_id
    where plan_structures.owner_id = '97000000-0000-4000-8000-000000000001'
    order by plan_structures.position
  $$,
  $$
    values
      ('programme'::text, 'PLAN-LINK-PROG'::text, 0),
      ('major'::text, 'PLAN-LINK-MAJOR'::text, 1),
      ('minor'::text, 'PLAN-LINK-MIN-A'::text, 2),
      ('minor'::text, 'PLAN-LINK-MIN-B'::text, 3),
      ('specialisation'::text, 'PLAN-LINK-SPEC'::text, 4)
  $$,
  'saved plan structures retain their roles and deterministic order'
);

select extensions.lives_ok(
  $$
    select public.save_current_user_primary_plan(
      'Plan Structure Student',
      'u1234567',
      2030::smallint,
      2030::smallint,
      'part_time',
      'PLAN-LINK-PROG',
      'PLAN-LINK-MAJOR',
      array['PLAN-LINK-MIN-B'],
      array[]::text[]
    )
  $$,
  'saving the profile again atomically replaces its structure selections'
);

select extensions.results_eq(
  $$
    select plan_structures.role, structures.code, plan_structures.position
    from public.plan_structures
    join public.catalogue_records as structure_years
      on structure_years.id = plan_structures.catalogue_record_id
    join public.catalogue_codes as structures
      on structures.id = structure_years.code_id
    where plan_structures.owner_id = '97000000-0000-4000-8000-000000000001'
    order by plan_structures.position
  $$,
  $$
    values
      ('programme'::text, 'PLAN-LINK-PROG'::text, 0),
      ('major'::text, 'PLAN-LINK-MAJOR'::text, 1),
      ('minor'::text, 'PLAN-LINK-MIN-B'::text, 2)
  $$,
  'a repeat save removes deselected minors and specialisations'
);

select extensions.throws_ok(
  $$
    select public.save_current_user_primary_plan(
      'Plan Structure Student',
      'u1234567',
      2030::smallint,
      2030::smallint,
      'full_time',
      'PLAN-LINK-PROG',
      'PLAN-LINK-MAJOR',
      array['PLAN-LINK-UNRELATED'],
      array[]::text[]
    )
  $$,
  '22023',
  'The selected minor is not an explicit option for that programme.',
  'an unrelated minor cannot be attached to a programme'
);

select extensions.is(
  (
    select count(*)::integer
    from public.plan_structures
    where owner_id = '97000000-0000-4000-8000-000000000001'
  ),
  3,
  'a rejected save leaves the existing plan selection unchanged'
);

select extensions.throws_ok(
  $$
    select public.save_current_user_primary_plan(
      'Plan Structure Student',
      'u1234567',
      2030::smallint,
      2030::smallint,
      'full_time',
      'PLAN-LINK-PROG',
      'PLAN-LINK-MAJOR',
      array['PLAN-LINK-MIN-A', 'PLAN-LINK-MIN-A'],
      array[]::text[]
    )
  $$,
  '22023',
  'Select each academic structure only once.',
  'duplicate supplementary structure selections are rejected'
);

select extensions.throws_ok(
  $$
    insert into public.plan_structures (
      plan_id,
      owner_id,
      catalogue_record_id,
      role,
      position
    )
    select
      plans.id,
      plans.owner_id,
      structure_years.id,
      'specialisation',
      99
    from public.plans
    join public.catalogue_records as structure_years
      on structure_years.academic_year_id = plans.academic_year_id
    join public.catalogue_codes as structures
      on structures.id = structure_years.code_id
    where plans.owner_id = '97000000-0000-4000-8000-000000000001'
      and structures.code = 'PLAN-LINK-MIN-A'
  $$,
  '23514',
  'The plan structure role must match the academic structure kind.',
  'a direct plan row cannot mislabel the selected structure kind'
);

select extensions.throws_ok(
  $$
    insert into public.plan_structures (
      plan_id,
      owner_id,
      catalogue_record_id,
      role,
      position
    )
    select
      plans.id,
      plans.owner_id,
      structure_years.id,
      'major',
      99
    from public.plans
    join public.catalogue_records as structure_years
      on structure_years.academic_year_id = plans.academic_year_id
    join public.catalogue_codes as structures
      on structures.id = structure_years.code_id
    where plans.owner_id = '97000000-0000-4000-8000-000000000001'
      and structures.code = 'PLAN-LINK-MAJOR'
  $$,
  '23505',
  null,
  'a direct plan row cannot add a second major'
);

reset role;

select * from extensions.finish();

rollback;
