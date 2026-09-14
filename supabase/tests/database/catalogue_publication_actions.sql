begin;
\ir ../helpers/catalogue-review.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.publish_academic_structure_snapshot(bigint,bigint)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.publish_academic_structure_snapshot(bigint,bigint)',
    'execute'
  )
  and to_regprocedure(
    'public.publish_catalogue_structure_version(text,smallint)'
  ) is null,
  'only the snapshot-native academic structure publication action remains'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '96000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'structure-publisher@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

update private.user_roles
set role_id = (select id from private.app_roles where key = 'admin')
where user_id = '96000000-0000-4000-8000-000000000001';

insert into public.academic_structures (code, kind)
values ('PBLS-TEST', 'programme');

insert into public.academic_structure_years (structure_id, academic_year_id)
select structures.id, years.id
from public.academic_structures as structures
join public.academic_years as years on years.year = 2026
where structures.code = 'PBLS-TEST';

insert into public.academic_structure_snapshots (
  structure_year_id,
  academic_year_id,
  origin,
  schema_version,
  semantic_hash,
  name,
  confirmation_status
)
select
  structure_years.id,
  structure_years.academic_year_id,
  'manual',
  'academic-structure-snapshot.test',
  hashes.semantic_hash,
  hashes.name,
  hashes.confirmation_status
from public.academic_structure_years as structure_years
join public.academic_structures as structures
  on structures.id = structure_years.structure_id
cross join (values
  (repeat('a', 64), 'Publishable draft'::text, 'not_required'::text),
  (repeat('b', 64), 'Blocked draft', 'required')
) as hashes(semantic_hash, name, confirmation_status)
where structures.code = 'PBLS-TEST';

-- A pending candidate must not be publishable when the draft pointer is null.
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select extensions.throws_ok(
  format('select public.publish_academic_structure_snapshot(%s, %s)',
    (select structure_year_id from public.academic_structure_snapshots where name = 'Publishable draft'),
    (select id from public.academic_structure_snapshots where name = 'Publishable draft')),
  '55000', 'Publish the exact current draft.',
  'a candidate cannot be published without a current draft'
);
reset role;

update public.academic_structure_years as structure_years
set draft_snapshot_id = snapshots.id
from public.academic_structure_snapshots as snapshots
where snapshots.structure_year_id = structure_years.id
  and snapshots.name = 'Blocked draft';

select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select extensions.throws_ok(
  format(
    'select public.publish_academic_structure_snapshot(%s, %s)',
    (
      select structure_years.id
      from public.academic_structure_years as structure_years
      join public.academic_structures as structures
        on structures.id = structure_years.structure_id
      where structures.code = 'PBLS-TEST'
    ),
    (
      select id from public.academic_structure_snapshots
      where name = 'Blocked draft'
    )
  ),
  '55000',
  'Resolve blocking review items before publication.',
  'a draft requiring confirmation cannot be published'
);

reset role;

update public.academic_structure_years as structure_years
set draft_snapshot_id = snapshots.id
from public.academic_structure_snapshots as snapshots
where snapshots.structure_year_id = structure_years.id
  and snapshots.name = 'Publishable draft';

set local role authenticated;

select pg_temp.approve_catalogue_fixture('programme', id) from public.academic_structure_snapshots where name = 'Publishable draft';

select extensions.lives_ok(
  format(
    'select public.publish_academic_structure_snapshot(%s, %s)',
    (
      select structure_years.id
      from public.academic_structure_years as structure_years
      join public.academic_structures as structures
        on structures.id = structure_years.structure_id
      where structures.code = 'PBLS-TEST'
    ),
    (
      select id from public.academic_structure_snapshots
      where name = 'Publishable draft'
    )
  ),
  'an administrator can publish the exact current draft'
);

select extensions.ok(
  exists (
    select 1
    from public.academic_structure_years as structure_years
    join public.academic_structure_snapshots as snapshots
      on snapshots.id = structure_years.published_snapshot_id
    where snapshots.name = 'Publishable draft'
      and structure_years.draft_snapshot_id = snapshots.id
  ),
  'publication moves only the published pointer to the reviewed snapshot'
);

select extensions.throws_ok(
  format(
    'select public.publish_academic_structure_snapshot(%s, %s)',
    (
      select structure_years.id
      from public.academic_structure_years as structure_years
      join public.academic_structures as structures
        on structures.id = structure_years.structure_id
      where structures.code = 'PBLS-TEST'
    ),
    (
      select id from public.academic_structure_snapshots
      where name = 'Blocked draft'
    )
  ),
  '55000',
  'Publish the exact current draft.',
  'publication rejects a stale snapshot identifier'
);

rollback;
