begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

-- Structure -------------------------------------------------------------------------

select extensions.is(
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'catalogue_items',
        'catalogue_item_years',
        'catalogue_snapshots',
        'catalogue_publications',
        'course_snapshot_details',
        'structure_snapshot_details',
        'snapshot_field_evidence'
      )
  ),
  7::bigint,
  'the shared catalogue tables exist'
);

select extensions.ok(
  to_regclass('public.courses') is null
  and to_regclass('public.course_years') is null
  and to_regclass('public.course_snapshots') is null
  and to_regclass('public.academic_structures') is null
  and to_regclass('public.academic_structure_years') is null
  and to_regclass('public.academic_structure_snapshots') is null
  and to_regclass('public.course_source_pages') is null
  and to_regclass('public.academic_structure_source_pages') is null,
  'the kind-specific identity, year, snapshot and source tables are absent'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_class as relations
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'public'
      and relations.relname in (
        'catalogue_items',
        'catalogue_item_years',
        'catalogue_snapshots',
        'catalogue_publications',
        'course_snapshot_details',
        'structure_snapshot_details',
        'snapshot_field_evidence'
      )
      and relations.relrowsecurity
  ),
  7::bigint,
  'RLS is enabled on every shared catalogue table'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_items (kind, code) values ('course', 'not-a-code') $$,
  '23514',
  null,
  'course codes follow the ANU format'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_items (kind, code) values ('degree', 'X') $$,
  '23514',
  null,
  'only the five catalogue kinds are accepted'
);

-- Kind consistency --------------------------------------------------------------------

select pg_temp.catalogue_item_year('programme', 'FIX-PROG', 2029::smallint);

select extensions.throws_ok(
  $$
    insert into public.catalogue_item_years (item_id, kind, academic_year_id)
    select items.id, 'course', years.id
    from public.catalogue_items as items
    cross join public.academic_years as years
    where items.code = 'FIX-PROG' and years.year = 2028
  $$,
  '23503',
  null,
  'an item year must carry the kind of its item'
);

select pg_temp.create_structure_snapshot('programme', 'FIX-PROG', 2029::smallint, 'Fixture programme');

select extensions.throws_ok(
  $$
    insert into public.course_snapshot_details (snapshot_id, title, units, level, subject_code)
    select snapshots.id, 'Wrong kind', 6, 1000, 'FIXP'
    from public.catalogue_snapshots as snapshots
    join public.catalogue_item_years as item_years on item_years.id = snapshots.item_year_id
    join public.catalogue_items as items on items.id = item_years.item_id
    where items.code = 'FIX-PROG'
  $$,
  '23503',
  null,
  'course details cannot attach to a structure snapshot'
);

-- Sealing and publication -------------------------------------------------------------

select pg_temp.create_course_snapshot('FIXT1000', 2029::smallint, 'Fixture draft');

select extensions.lives_ok(
  $$
    insert into public.course_fees (snapshot_id, position, fee_year, audience, fee_type, amount, currency, basis, source_label, source_text)
    select snapshots.id, 1, 2029, 'domestic', 'indicative', 1000, 'AUD', 'course', 'Fee', 'Fee'
    from public.catalogue_snapshots as snapshots
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    where details.title = 'Fixture draft'
  $$,
  'child rows can be assembled while a snapshot is unsealed'
);

select extensions.is(
  (select count(*) from public.catalogue_publications),
  0::bigint,
  'no publication is recorded before a pointer is set'
);

select pg_temp.publish_snapshot((
  select snapshots.id
  from public.catalogue_snapshots as snapshots
  join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
  where details.title = 'Fixture draft'
));

select extensions.ok(
  (
    select snapshots.sealed_at is not null
    from public.catalogue_snapshots as snapshots
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    where details.title = 'Fixture draft'
  ),
  'setting the published pointer seals the snapshot'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_snapshots as snapshots on snapshots.id = publications.snapshot_id
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    where details.title = 'Fixture draft'
  ),
  1::bigint,
  'publication is recorded in the ledger'
);

select extensions.throws_ok(
  $$
    insert into public.course_fees (snapshot_id, position, fee_year, audience, fee_type, amount, currency, basis, source_label, source_text)
    select snapshots.id, 2, 2029, 'domestic', 'indicative', 1000, 'AUD', 'course', 'Fee', 'Fee'
    from public.catalogue_snapshots as snapshots
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    where details.title = 'Fixture draft'
  $$,
  '55000',
  null,
  'child rows cannot be appended to a sealed snapshot'
);

select extensions.throws_ok(
  $$
    update public.course_snapshot_details set title = 'Edited' where title = 'Fixture draft'
  $$,
  '55000',
  null,
  'sealed details cannot be edited in place'
);

select extensions.throws_ok(
  $$ update public.catalogue_snapshots set origin = 'import' where kind = 'course' $$,
  '55000',
  null,
  'sealed snapshots are immutable'
);

select extensions.throws_ok(
  $$ delete from public.catalogue_snapshots where kind = 'course' $$,
  '55000',
  null,
  'snapshots cannot be deleted'
);

select pg_temp.create_course_snapshot('FIXT1000', 2029::smallint, 'Fixture revision');

update public.catalogue_item_years as item_years
set draft_snapshot_id = snapshots.id
from public.catalogue_snapshots as snapshots
join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
where details.title = 'Fixture revision'
  and item_years.id = snapshots.item_year_id;

select extensions.ok(
  (
    select snapshots.sealed_at is not null
    from public.catalogue_snapshots as snapshots
    join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
    where details.title = 'Fixture revision'
  ),
  'setting the draft pointer also seals the snapshot'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_item_years as item_years on item_years.id = publications.item_year_id
    join public.catalogue_items as items on items.id = item_years.item_id
    where items.code = 'FIXT1000'
  ),
  1::bigint,
  'a draft pointer does not create a publication record'
);

select extensions.throws_ok(
  $$
    update public.catalogue_item_years
    set published_snapshot_id = draft_snapshot_id
    where draft_snapshot_id is not null
  $$,
  '23514',
  null,
  'a snapshot cannot be both the draft and the published version'
);

update public.catalogue_item_years
set published_snapshot_id = draft_snapshot_id, draft_snapshot_id = null
where draft_snapshot_id is not null;

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_item_years as item_years on item_years.id = publications.item_year_id
    join public.catalogue_items as items on items.id = item_years.item_id
    where items.code = 'FIXT1000'
  ),
  2::bigint,
  'republishing appends to the ledger'
);

select extensions.throws_ok(
  $$
    update public.catalogue_item_years
    set published_snapshot_id = (
      select snapshots.id
      from public.catalogue_snapshots as snapshots
      join public.course_snapshot_details as details on details.snapshot_id = snapshots.id
      where details.title = 'Fixture draft'
    )
    where kind = 'programme'
  $$,
  '23503',
  null,
  'a pointer must reference a snapshot of the same item year'
);

-- Archival -----------------------------------------------------------------------------

select pg_temp.publish_course('FIXT2000', 2029::smallint, 'Archivable');

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '97000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'catalogue-student@example.test',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now()
);

insert into public.plans (owner_id, academic_year_id, name, is_primary, commencement_year, study_load)
values (
  '97000000-0000-4000-8000-000000000001',
  (select id from public.academic_years where year = 2029),
  'Catalogue test', true, 2029, 'full_time'
);

insert into public.plan_items (plan_id, owner_id, course_id, academic_year_id)
select plans.id, plans.owner_id, items.id, plans.academic_year_id
from public.plans
join public.catalogue_items as items on items.code = 'FIXT2000'
where plans.owner_id = '97000000-0000-4000-8000-000000000001';

select extensions.throws_ok(
  $$
    update public.catalogue_item_years set archived_at = now()
    where item_id = (select id from public.catalogue_items where code = 'FIXT2000')
  $$,
  '55000',
  null,
  'a catalogue year referenced by a plan cannot be archived'
);

select extensions.throws_ok(
  $$
    insert into public.plan_items (plan_id, owner_id, course_id, academic_year_id)
    select plans.id, plans.owner_id, items.id, plans.academic_year_id
    from public.plans
    join public.catalogue_items as items on items.code = 'FIX-PROG'
    where plans.owner_id = '97000000-0000-4000-8000-000000000001'
  $$,
  'P0002',
  null,
  'plan items reference course years only'
);

delete from public.plan_items where owner_id = '97000000-0000-4000-8000-000000000001';

update public.catalogue_item_years set archived_at = now()
where item_id = (select id from public.catalogue_items where code = 'FIXT2000');

select extensions.throws_ok(
  $$
    update public.catalogue_item_years set archived_at = null
    where item_id = (select id from public.catalogue_items where code = 'FIXT2000')
  $$,
  '55000',
  null,
  'archived catalogue years are immutable'
);

select extensions.throws_ok(
  $$
    insert into public.plan_items (plan_id, owner_id, course_id, academic_year_id)
    select plans.id, plans.owner_id, items.id, plans.academic_year_id
    from public.plans
    join public.catalogue_items as items on items.code = 'FIXT2000'
    where plans.owner_id = '97000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  null,
  'plan items cannot reference an archived course year'
);

-- Attempt lineage -----------------------------------------------------------------------

insert into public.academic_periods (
  calendar_year, code, name, short_name, starts_on, ends_on, sort_order, status
) values (2029, 'FIX-S1', 'Fixture Semester 1', 'S1', '2029-02-19', '2029-05-25', 1, 'published');

select extensions.throws_ok(
  $$
    insert into public.course_attempts (owner_id, course_id, course_snapshot_id, academic_period_id, status, units_attempted)
    select
      '97000000-0000-4000-8000-000000000001',
      (select id from public.catalogue_items where code = 'FIXT1000'),
      (select published_snapshot_id from public.catalogue_item_years where item_id = (select id from public.catalogue_items where code = 'FIXT2000')),
      (select id from public.academic_periods where code = 'FIX-S1'),
      'completed',
      6
  $$,
  '23503',
  null,
  'an attempt snapshot must belong to the attempted course'
);

select extensions.lives_ok(
  $$
    insert into public.course_attempts (owner_id, course_id, course_snapshot_id, academic_period_id, status, units_attempted)
    select
      '97000000-0000-4000-8000-000000000001',
      (select id from public.catalogue_items where code = 'FIXT1000'),
      (select published_snapshot_id from public.catalogue_item_years where item_id = (select id from public.catalogue_items where code = 'FIXT1000')),
      (select id from public.academic_periods where code = 'FIX-S1'),
      'completed',
      6
  $$,
  'an attempt records the published snapshot of its course'
);

-- Access --------------------------------------------------------------------------------

select pg_temp.create_course_snapshot('FIXT3000', 2029::smallint, 'Never published');

set local role anon;

select extensions.results_eq(
  $$
    select code from public.catalogue_items where code like 'FIXT%' order by code
  $$,
  $$ values ('FIXT1000'::text) $$,
  'anonymous readers see identities with a published, unarchived year only'
);

select extensions.is(
  (select count(*) from public.course_snapshot_details where title in ('Fixture draft', 'Never published')),
  0::bigint,
  'anonymous readers cannot see superseded or unpublished snapshots'
);

select extensions.is(
  (select public.published_course_detail('FIXT1000', 2029::smallint) #>> '{snapshot,title}'),
  'Fixture revision',
  'the published detail reads the current published snapshot'
);

select extensions.ok(
  not has_function_privilege('anon', 'public.add_current_user_plan_item(text,smallint,smallint,text)', 'execute')
  and not has_function_privilege('anon', 'public.save_current_user_primary_plan(text,text,smallint,smallint,text,text,text,text[],text[])', 'execute')
  and has_function_privilege('anon', 'public.published_course_detail(text,smallint)', 'execute'),
  'anonymous callers read published data and cannot write plans'
);

reset role;

select * from extensions.finish();

rollback;
