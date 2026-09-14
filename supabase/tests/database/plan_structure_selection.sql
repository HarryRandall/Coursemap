begin;
\ir ../helpers/catalogue-review.inc

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

insert into public.academic_structures (code, kind)
values
  ('PLAN-LINK-PROG', 'programme'),
  ('PLAN-LINK-MAJOR', 'major'),
  ('PLAN-LINK-MIN-A', 'minor'),
  ('PLAN-LINK-MIN-B', 'minor'),
  ('PLAN-LINK-SPEC', 'specialisation'),
  ('PLAN-LINK-UNRELATED', 'minor');

insert into public.academic_structure_years (
  structure_id,
  academic_year_id
)
select structures.id, years.id
from public.academic_structures as structures
join public.academic_years as years on years.year = 2030
where structures.code like 'PLAN-LINK-%';

insert into public.academic_structure_snapshots (
  structure_year_id,
  academic_year_id,
  origin,
  schema_version,
  semantic_hash,
  name,
  units,
  duration_years,
  confirmation_status
)
select
  structure_years.id,
  structure_years.academic_year_id,
  'manual',
  'plan-structure-selection.test',
  md5(structures.code) || md5('published:' || structures.code),
  structures.code || ' test structure',
  case when structures.kind = 'programme' then 144 else 24 end,
  case when structures.kind = 'programme' then 3 else null end,
  'not_required'
from public.academic_structure_years as structure_years
join public.academic_structures as structures
  on structures.id = structure_years.structure_id
where structures.code like 'PLAN-LINK-%';

insert into public.academic_structure_snapshot_relationships (
  snapshot_id,
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
from public.academic_structure_snapshots as snapshots
join public.academic_structure_years as structure_years
  on structure_years.id = snapshots.structure_year_id
join public.academic_structures as structures
  on structures.id = structure_years.structure_id
cross join (
  values
    (1, 'major'::text, 'PLAN-LINK-MAJOR'::text),
    (2, 'minor', 'PLAN-LINK-MIN-A'),
    (3, 'minor', 'PLAN-LINK-MIN-B'),
    (4, 'specialisation', 'PLAN-LINK-SPEC')
) as selected(position, target_kind, target_code)
where structures.code = 'PLAN-LINK-PROG';

select pg_temp.approve_catalogue_fixture('programme', snapshots.id)
from public.academic_structure_snapshots as snapshots
cross join public.academic_structure_years as structure_years
where snapshots.structure_year_id = structure_years.id
  and snapshots.academic_year_id = structure_years.academic_year_id
  and exists (
    select 1
    from public.academic_structures as structures
    where structures.id = structure_years.structure_id
      and structures.code like 'PLAN-LINK-%'
  );

update public.academic_structure_years as structure_years
set published_snapshot_id = snapshots.id
from public.academic_structure_snapshots as snapshots
where snapshots.structure_year_id = structure_years.id
  and snapshots.academic_year_id = structure_years.academic_year_id
  and exists (
    select 1
    from public.academic_structures as structures
    where structures.id = structure_years.structure_id
      and structures.code like 'PLAN-LINK-%'
  );

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
    join public.academic_structure_years as structure_years
      on structure_years.id = plan_structures.structure_year_id
    join public.academic_structures as structures
      on structures.id = structure_years.structure_id
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
    join public.academic_structure_years as structure_years
      on structure_years.id = plan_structures.structure_year_id
    join public.academic_structures as structures
      on structures.id = structure_years.structure_id
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
      academic_year_id,
      structure_year_id,
      role,
      position
    )
    select
      plans.id,
      plans.owner_id,
      plans.academic_year_id,
      structure_years.id,
      'specialisation',
      99
    from public.plans
    join public.academic_structure_years as structure_years
      on structure_years.academic_year_id = plans.academic_year_id
    join public.academic_structures as structures
      on structures.id = structure_years.structure_id
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
      academic_year_id,
      structure_year_id,
      role,
      position
    )
    select
      plans.id,
      plans.owner_id,
      plans.academic_year_id,
      structure_years.id,
      'major',
      99
    from public.plans
    join public.academic_structure_years as structure_years
      on structure_years.academic_year_id = plans.academic_year_id
    join public.academic_structures as structures
      on structures.id = structure_years.structure_id
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
