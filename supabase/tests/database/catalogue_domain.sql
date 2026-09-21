begin;
\ir ../helpers/catalogue-fixtures.inc

create extension if not exists pgtap with schema extensions;

select extensions.plan(34);

-- Structure -------------------------------------------------------------------------

select extensions.is(
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'catalogue_codes',
        'catalogue_records',
        'catalogue_versions',
        'catalogue_publications',
        'course_version_details',
        'structure_version_details',
        'catalogue_version_provenance'
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
        'catalogue_codes',
        'catalogue_records',
        'catalogue_versions',
        'catalogue_publications',
        'course_version_details',
        'structure_version_details',
        'catalogue_version_provenance'
      )
      and relations.relrowsecurity
  ),
  7::bigint,
  'RLS is enabled on every shared catalogue table'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_codes (kind, code) values ('course', 'not-a-code') $$,
  '23514',
  null,
  'course codes follow the ANU format'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_codes (kind, code) values ('degree', 'X') $$,
  '23514',
  null,
  'only the five catalogue kinds are accepted'
);

insert into public.catalogue_codes (kind, code)
values
  ('course', 'KIND1000'),
  ('programme', 'KIND-PROG'),
  ('major', 'KIND-MAJ'),
  ('minor', 'KINDA-MIN'),
  ('specialisation', 'KIND-SPEC');

select extensions.is(
  (select count(distinct kind) from public.catalogue_codes where code like 'KIND%'),
  5::bigint,
  'all five catalogue kinds share the code model'
);

select extensions.throws_ok(
  $$ insert into public.catalogue_codes (kind, code) values ('course', 'KIND1000') $$,
  '23505',
  null,
  'a typed catalogue code is unique'
);

-- Kind consistency --------------------------------------------------------------------

select pg_temp.catalogue_item_year('programme', 'FIX-PROG', 2029::smallint);

select extensions.throws_ok(
  $$
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    select records.code_id, records.kind, records.academic_year_id
    from public.catalogue_records as records
    join public.catalogue_codes as codes on codes.id = records.code_id
    where codes.code = 'FIX-PROG'
  $$,
  '23505',
  null,
  'a catalogue code has only one record in an academic year'
);

select extensions.throws_ok(
  $$
    insert into public.catalogue_records (code_id, kind, academic_year_id)
    select items.id, 'course', years.id
    from public.catalogue_codes as items
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
    insert into public.course_version_details (version_id, title, units, level, subject_code)
    select snapshots.id, 'Wrong kind', 6, 1000, 'FIXP'
    from public.catalogue_versions as snapshots
    join public.catalogue_records as item_years on item_years.id = snapshots.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
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
    insert into public.course_fees (version_id, position, fee_year, audience, fee_type, amount, currency, basis, source_label, source_text)
    select snapshots.id, 1, 2029, 'domestic', 'indicative', 1000, 'AUD', 'course', 'Fee', 'Fee'
    from public.catalogue_versions as snapshots
    join public.course_version_details as details on details.version_id = snapshots.id
    where details.title = 'Fixture draft'
  $$,
  'child rows can be assembled while a snapshot is unsealed'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_records as item_years on item_years.id = publications.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = 'FIXT1000'
  ),
  0::bigint,
  'no publication is recorded before a pointer is set'
);

select pg_temp.publish_snapshot((
  select snapshots.id
  from public.catalogue_versions as snapshots
  join public.course_version_details as details on details.version_id = snapshots.id
  where details.title = 'Fixture draft'
));

select extensions.ok(
  (
    select snapshots.sealed_at is not null
    from public.catalogue_versions as snapshots
    join public.course_version_details as details on details.version_id = snapshots.id
    where details.title = 'Fixture draft'
  ),
  'setting the published pointer seals the snapshot'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_versions as snapshots on snapshots.id = publications.version_id
    join public.course_version_details as details on details.version_id = snapshots.id
    where details.title = 'Fixture draft'
  ),
  1::bigint,
  'publication is recorded in the ledger'
);

select extensions.throws_ok(
  $$
    insert into public.course_fees (version_id, position, fee_year, audience, fee_type, amount, currency, basis, source_label, source_text)
    select snapshots.id, 2, 2029, 'domestic', 'indicative', 1000, 'AUD', 'course', 'Fee', 'Fee'
    from public.catalogue_versions as snapshots
    join public.course_version_details as details on details.version_id = snapshots.id
    where details.title = 'Fixture draft'
  $$,
  '55000',
  null,
  'child rows cannot be appended to a sealed snapshot'
);

select extensions.throws_ok(
  $$
    update public.course_version_details set title = 'Edited' where title = 'Fixture draft'
  $$,
  '55000',
  null,
  'sealed details cannot be edited in place'
);

select extensions.throws_ok(
  $$ update public.catalogue_versions set origin = 'import' where kind = 'course' $$,
  '55000',
  null,
  'sealed snapshots are immutable'
);

select extensions.throws_ok(
  $$ delete from public.catalogue_versions where kind = 'course' $$,
  '55000',
  null,
  'snapshots cannot be deleted'
);

select pg_temp.create_course_snapshot('FIXT1000', 2029::smallint, 'Fixture revision');

select extensions.lives_ok(
  $$
    insert into public.catalogue_versions (
      record_id, kind, academic_year_id, origin, based_on_version_id, content_hash
    )
    select revisions.record_id, revisions.kind, revisions.academic_year_id,
      'manual', originals.id, repeat('a', 64)
    from public.catalogue_versions as revisions
    join public.course_version_details as revision_details
      on revision_details.version_id = revisions.id
    join public.catalogue_versions as originals
      on originals.record_id = revisions.record_id
    join public.course_version_details as original_details
      on original_details.version_id = originals.id
    where revision_details.title = 'Fixture revision'
      and original_details.title = 'Fixture draft'
  $$,
  'version lineage can reference an earlier version of the same record'
);

select extensions.ok(
  (
    select versions.sealed_at is null
    from public.catalogue_versions as versions
    join public.course_version_details as details on details.version_id = versions.id
    where details.title = 'Fixture revision'
  ),
  'a new version remains mutable while it is assembled'
);

select extensions.is(
  (
    select count(*)
    from public.catalogue_publications as publications
    join public.catalogue_records as item_years on item_years.id = publications.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = 'FIXT1000'
  ),
  1::bigint,
  'creating a new version does not publish it'
);

select extensions.lives_ok(
  $$
    select pg_temp.publish_snapshot((
      select versions.id
      from public.catalogue_versions as versions
      join public.course_version_details as details on details.version_id = versions.id
      where details.title = 'Fixture revision'
    ))
  $$,
  'publishing a new version seals it without a draft phase'
);

select extensions.is(
  (
    select count(*) filter (where unpublished_at is not null) * 10
      + count(*) filter (where unpublished_at is null)
    from public.catalogue_publications as publications
    join public.catalogue_records as item_years on item_years.id = publications.record_id
    join public.catalogue_codes as items on items.id = item_years.code_id
    where items.code = 'FIXT1000'
  ),
  11::bigint,
  'publishing a new version closes the old interval and opens the new one'
);

select extensions.throws_ok(
  $$
    update public.catalogue_records
    set published_version_id = (
      select snapshots.id
      from public.catalogue_versions as snapshots
      join public.course_version_details as details on details.version_id = snapshots.id
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

insert into public.plan_items (plan_id, owner_id, catalogue_record_id)
select plans.id, plans.owner_id, item_years.id
from public.plans
join public.catalogue_codes as items on items.code = 'FIXT2000'
join public.catalogue_records as item_years
  on item_years.code_id = items.id
  and item_years.academic_year_id = plans.academic_year_id
where plans.owner_id = '97000000-0000-4000-8000-000000000001';

select extensions.throws_ok(
  $$
    update public.catalogue_records set archived_at = now()
    where code_id = (select id from public.catalogue_codes where code = 'FIXT2000')
  $$,
  '55000',
  null,
  'a catalogue year referenced by a plan cannot be archived'
);

select extensions.throws_ok(
  $$
    insert into public.plan_items (plan_id, owner_id, catalogue_record_id)
    select plans.id, plans.owner_id, item_years.id
    from public.plans
    join public.catalogue_codes as items on items.code = 'FIX-PROG'
    join public.catalogue_records as item_years
      on item_years.code_id = items.id
      and item_years.academic_year_id = plans.academic_year_id
    where plans.owner_id = '97000000-0000-4000-8000-000000000001'
  $$,
  'P0002',
  null,
  'plan items reference course years only'
);

delete from public.plan_items where owner_id = '97000000-0000-4000-8000-000000000001';

update public.catalogue_records set archived_at = now()
where code_id = (select id from public.catalogue_codes where code = 'FIXT2000');

select extensions.throws_ok(
  $$
    update public.catalogue_records set archived_at = null
    where code_id = (select id from public.catalogue_codes where code = 'FIXT2000')
  $$,
  '55000',
  null,
  'archived catalogue years are immutable'
);

select extensions.throws_ok(
  $$
    insert into public.plan_items (plan_id, owner_id, catalogue_record_id)
    select plans.id, plans.owner_id, item_years.id
    from public.plans
    join public.catalogue_codes as items on items.code = 'FIXT2000'
    join public.catalogue_records as item_years
      on item_years.code_id = items.id
      and item_years.academic_year_id = plans.academic_year_id
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
    insert into public.course_attempts (owner_id, catalogue_version_id, academic_period_id, status, units_attempted)
    select
      '97000000-0000-4000-8000-000000000001',
      (select versions.id
       from public.catalogue_versions as versions
       join public.catalogue_records as records on records.id = versions.record_id
       where records.kind = 'programme' limit 1),
      (select id from public.academic_periods where code = 'FIX-S1'),
      'completed',
      6
  $$,
  '23503',
  null,
  'an attempt version must belong to a course record'
);

select extensions.lives_ok(
  $$
    insert into public.course_attempts (owner_id, catalogue_version_id, academic_period_id, status, units_attempted)
    select
      '97000000-0000-4000-8000-000000000001',
      (select published_version_id from public.catalogue_records where code_id = (select id from public.catalogue_codes where code = 'FIXT1000')),
      (select id from public.academic_periods where code = 'FIX-S1'),
      'completed',
      6
  $$,
  'an attempt records an exact course version'
);

-- Access --------------------------------------------------------------------------------

select pg_temp.create_course_snapshot('FIXT3000', 2029::smallint, 'Never published');

set local role anon;

select extensions.results_eq(
  $$
    select code from public.catalogue_codes where code like 'FIXT%' order by code
  $$,
  $$ values ('FIXT1000'::text) $$,
  'anonymous readers see identities with a published, unarchived year only'
);

select extensions.is(
  (select count(*) from public.course_version_details where title in ('Fixture draft', 'Never published')),
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
